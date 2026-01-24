import type { ExecutionContext } from "@cloudflare/workers-types";

import type { Env } from "./types/env";
import { json, err, getUrl, readJson, requireAuth, notFound } from "./lib/http";
import { getDb } from "./lib/db";
import { ensureDemoTeam } from "./repositories/teams";
import {
  listNotificationChannels,
  createWebhookChannel,
  createEmailChannel,
  deleteNotificationChannel,
  notificationChannelExists,
} from "./repositories/notification-channels";
import {
  listMonitors,
  createMonitor,
  deleteMonitor,
  getMonitorById,
} from "./repositories/monitors";
import {
  listStatusPages,
  createStatusPage,
  getStatusPageById,
  deleteStatusPage,
  getStatusPageBySlug,
  rebuildStatusSnapshot,
} from "./repositories/status-pages";
import {
  listNotificationPolicies,
  createNotificationPolicy,
  deleteNotificationPolicy,
} from "./repositories/notification-policies";
import {
  createUser,
  authenticateUser,
  getUserById,
  createSession,
  deleteSession,
  validateSession,
} from "./repositories/auth";
import { getMonitorMetrics } from "./repositories/metrics";
import { clampInt } from "./lib/utils";

type CreateMonitorBody = {
  name: string;
  url: string;
  interval_seconds: number;
  timeout_ms: number;
  failure_threshold: number;
};

type CreateStatusPageBody = {
  name: string;
  slug: string;
  logo_url?: string;
  brand_color?: string;
  custom_css?: string;
};

type CreateWebhookChannelBody = {
  url: string;
  label?: string;
  enabled?: number;
};

type CreateEmailChannelBody = {
  to: string;
  from?: string;
  subject?: string;
  label?: string;
  enabled?: number;
};

type CreateNotificationPolicyBody = {
  monitor_id: string;
  channel_id: string;
  threshold_failures?: number;
  notify_on_recovery?: number;
};

type SignUpBody = {
  email: string;
  password: string;
};

type SignInBody = {
  email: string;
  password: string;
};

type LoginBody = {
  username: string;
  password: string;
};

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const db = getDb(env.DB);
    const url = getUrl(req);

    console.log(`${req.method} ${url.pathname}`);

    if (!url.pathname.startsWith("/api/")) {
      return notFound();
    }

    await ensureDemoTeam(db, env.PUBLIC_TEAM_ID);

    if (req.method === "POST" && url.pathname === "/api/auth/sign-up") {
      let body: SignUpBody | null = null;
      try {
        body = await readJson<SignUpBody>(req);
      } catch {
        return err(400, "Invalid JSON body.");
      }
      if (!body?.email || !body?.password)
        return err(400, "email and password are required.");

      if (!body.email.includes("@") || body.password.length < 8)
        return err(400, "Valid email and password (min 8 chars) required.");

      try {
        const { user } = await createUser(db, {
          email: body.email,
          password: body.password,
          team_id: env.PUBLIC_TEAM_ID,
        });
        const { password_hash: _, ...userWithoutPassword } = user;
        const { sessionToken } = await createSession(db, user.id);

        const response = json(
          { user: userWithoutPassword, sessionToken },
          { status: 201 },
        );
        response.headers.set(
          "Set-Cookie",
          `session_token=${sessionToken}; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=2592000`,
        );
        return response;
      } catch (e) {
        if (e instanceof Error && e.message.includes("already exists")) {
          return err(409, "User with this email already exists");
        }
        console.error("Sign-up error:", e);
        return err(500, "Failed to create user");
      }
    }

    if (req.method === "POST" && url.pathname === "/api/auth/sign-in") {
      let body: SignInBody | null = null;
      try {
        body = await readJson<SignInBody>(req);
      } catch {
        return err(400, "Invalid JSON body.");
      }
      if (!body?.email || !body?.password)
        return err(400, "email and password are required.");

      try {
        const { user } = await authenticateUser(db, body.email, body.password);
        const { sessionToken } = await createSession(db, user.id);

        const response = json({ user, sessionToken });
        response.headers.set(
          "Set-Cookie",
          `session_token=${sessionToken}; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=2592000`,
        );
        return response;
      } catch (e) {
        return err(401, "Invalid email or password");
      }
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const cookieHeader = req.headers.get("cookie") || "";
      const cookies: Record<string, string> = {};

      for (const cookie of cookieHeader.split(";")) {
        const [name, value] = cookie.trim().split("=");
        if (name && value) {
          cookies[name] = decodeURIComponent(value);
        }
      }

      const sessionToken = cookies.session_token;
      if (!sessionToken) {
        return err(401, "Authentication required.");
      }

      const session = await validateSession(db, sessionToken);
      if (!session) {
        return err(401, "Invalid or expired session.");
      }

      const user = await getUserById(db, session.userId);
      if (!user) return err(404, "User not found");

      return json({ user, sessionToken });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/sign-out") {
      const cookieHeader = req.headers.get("cookie") || "";
      const cookies: Record<string, string> = {};

      for (const cookie of cookieHeader.split(";")) {
        const [name, value] = cookie.trim().split("=");
        if (name && value) {
          cookies[name] = decodeURIComponent(value);
        }
      }

      const sessionToken = cookies.session_token;
      if (sessionToken) {
        await deleteSession(db, sessionToken);
      }

      const response = json({ ok: true });
      response.headers.set(
        "Set-Cookie",
        "session_token=; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=0",
      );
      return response;
    }

    if (
      req.method === "GET" &&
      url.pathname.startsWith("/api/public/status/")
    ) {
      const slug = decodeURIComponent(url.pathname.split("/").pop() || "");
      if (!slug) return err(400, "Missing slug.");

      const cached = await env.KV.get(`status:${slug}`);
      if (cached) {
        return new Response(cached, {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      const snapshot = await rebuildStatusSnapshot(
        db,
        env.KV,
        env.PUBLIC_TEAM_ID,
        slug,
      );
      if (!snapshot) return err(404, "Status page not found.");
      return json(snapshot);
    }

    const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
    if (isWrite) {
      const auth = await requireAuth(req, db);
      if (auth instanceof Response) return auth;
    }

    if (req.method === "GET" && url.pathname === "/api/monitors") {
      const monitors = await listMonitors(db, env.PUBLIC_TEAM_ID);
      return json({ monitors });
    }

    if (
      req.method === "GET" &&
      url.pathname.startsWith("/api/monitors/") &&
      url.pathname.endsWith("/metrics")
    ) {
      const parts = url.pathname.split("/");
      const monitorId = parts[3];
      if (!monitorId) return err(400, "Missing monitor ID");

      const searchParams = url.searchParams;
      const hours = Math.min(
        Math.max(Number.parseInt(searchParams.get("hours") || "24", 10), 1),
        168,
      );

      try {
        const result = await getMonitorMetrics(
          env.CLOUDFLARE_ACCOUNT_ID,
          env.CLOUDFLARE_API_TOKEN,
          monitorId,
          hours,
        );
        return json(result);
      } catch (error) {
        console.error("Failed to query analytics engine:", error);
        return err(500, "Failed to fetch metrics");
      }
    }

    if (req.method === "POST" && url.pathname === "/api/monitors") {
      const body = await readJson<CreateMonitorBody>(req);
      if (!body?.name || !body?.url)
        return err(400, "name and url are required.");
      try {
        const parsed = new URL(body.url);
        if (!["http:", "https:"].includes(parsed.protocol))
          return err(400, "url must be http or https.");
      } catch {
        return err(400, "url must be a valid URL.");
      }
      const interval_seconds = clampInt(body.interval_seconds, 30, 3600, 60);
      const timeout_ms = clampInt(body.timeout_ms, 1000, 30000, 8000);
      const failure_threshold = clampInt(body.failure_threshold, 1, 10, 3);

      const created = await createMonitor(db, env.PUBLIC_TEAM_ID, {
        ...body,
        interval_seconds,
        timeout_ms,
        failure_threshold,
      });
      return json({ ok: true, ...created }, { status: 201 });
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/monitors/")) {
      const parts = url.pathname.split("/");
      const id = parts[parts.length - 1];
      if (!id) return err(400, "Missing monitor ID");
      await deleteMonitor(db, env.PUBLIC_TEAM_ID, id);
      return json({ ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/status-pages") {
      const status_pages = await listStatusPages(db, env.PUBLIC_TEAM_ID);
      return json({ status_pages });
    }

    if (req.method === "POST" && url.pathname === "/api/status-pages") {
      const body = await readJson<CreateStatusPageBody>(req);
      if (!body?.name || !body?.slug)
        return err(400, "name and slug are required.");
      if (!/^[a-z0-9-]{2,60}$/.test(body.slug))
        return err(
          400,
          "slug must be 2-60 chars: lowercase letters, numbers, hyphen.",
        );

      const created = await createStatusPage(db, env.PUBLIC_TEAM_ID, {
        ...body,
        logo_url: body.logo_url?.trim() || null,
        brand_color: body.brand_color?.trim() || "#007bff",
        custom_css: body.custom_css?.trim() || null,
      });

      ctx.waitUntil(
        rebuildStatusSnapshot(db, env.KV, env.PUBLIC_TEAM_ID, body.slug).then(
          () => undefined,
        ),
      );
      return json({ ok: true, ...created }, { status: 201 });
    }

    if (
      req.method === "DELETE" &&
      url.pathname.startsWith("/api/status-pages/")
    ) {
      const parts = url.pathname.split("/");
      const id = parts[parts.length - 1];
      if (!id) return err(400, "Missing status page ID");
      const page = await getStatusPageById(db, env.PUBLIC_TEAM_ID, id);
      if (!page) return err(404, "Status page not found.");
      await deleteStatusPage(db, env.PUBLIC_TEAM_ID, id);
      await env.KV.delete(`status:${page.slug}`);
      return json({ ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/notification-channels") {
      const channels = await listNotificationChannels(db, env.PUBLIC_TEAM_ID);
      return json({ channels });
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/notification-channels"
    ) {
      const body = await readJson(req);
      if (!body?.type || !["webhook", "email"].includes(body.type))
        return err(400, 'type must be "webhook" or "email".');

      let created: { id: string };
      if (body.type === "webhook") {
        if (!body?.url)
          return err(400, "url is required for webhook channels.");
        try {
          const url = new URL(body.url);
          if (!["http:", "https:"].includes(url.protocol))
            return err(400, "url must be http or https.");
        } catch {
          return err(400, "url must be a valid URL.");
        }
        created = await createWebhookChannel(db, env.PUBLIC_TEAM_ID, {
          url: body.url,
          label: body.label,
          enabled: body.enabled,
        });
      } else if (body.type === "email") {
        if (!body?.to) return err(400, "to is required for email channels.");
        created = await createEmailChannel(db, env.PUBLIC_TEAM_ID, {
          to: body.to,
          from: body.from,
          subject: body.subject,
          label: body.label,
          enabled: body.enabled,
        });
      }

      return json({ ok: true, ...created }, { status: 201 });
    }

    if (
      req.method === "DELETE" &&
      url.pathname.startsWith("/api/notification-channels/")
    ) {
      const parts = url.pathname.split("/");
      const id = parts[parts.length - 1];
      if (!id) return err(400, "Missing channel ID");
      await deleteNotificationChannel(db, env.PUBLIC_TEAM_ID, id);
      return json({ ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/notification-policies") {
      const policies = await listNotificationPolicies(db, env.PUBLIC_TEAM_ID);
      return json({ policies });
    }

    if (
      req.method === "POST" &&
      url.pathname === "/api/notification-policies"
    ) {
      const body = await readJson<CreateNotificationPolicyBody>(req);
      if (!body?.monitor_id || !body?.channel_id)
        return err(400, "monitor_id and channel_id are required.");

      const monitor = await getMonitorById(
        db,
        env.PUBLIC_TEAM_ID,
        body.monitor_id,
      );
      if (!monitor) return err(404, "Monitor not found.");

      const channelExists = await notificationChannelExists(
        db,
        env.PUBLIC_TEAM_ID,
        body.channel_id,
      );
      if (!channelExists) return err(404, "Notification channel not found.");

      const threshold_failures = clampInt(body.threshold_failures, 1, 10, 3);
      const notify_on_recovery = body.notify_on_recovery === 0 ? 0 : 1;
      const created = await createNotificationPolicy(db, env.PUBLIC_TEAM_ID, {
        monitor_id: body.monitor_id,
        channel_id: body.channel_id,
        threshold_failures,
        notify_on_recovery,
      });
      return json({ ok: true, ...created }, { status: 201 });
    }

    if (
      req.method === "DELETE" &&
      url.pathname.startsWith("/api/notification-policies/")
    ) {
      const parts = url.pathname.split("/");
      const id = parts[parts.length - 1];
      if (!id) return err(400, "Missing policy ID");
      await deleteNotificationPolicy(db, env.PUBLIC_TEAM_ID, id);
      return json({ ok: true });
    }

    if (
      req.method === "POST" &&
      url.pathname.startsWith("/api/status-pages/") &&
      url.pathname.endsWith("/rebuild")
    ) {
      const parts = url.pathname.split("/");
      const slug = parts[3];
      const page = await getStatusPageBySlug(db, env.PUBLIC_TEAM_ID, slug);
      if (!page) return err(404, "Status page not found.");
      const snapshot = await rebuildStatusSnapshot(
        db,
        env.KV,
        env.PUBLIC_TEAM_ID,
        slug,
      );
      return json({ ok: true, snapshot });
    }

    return notFound();
  },
};
