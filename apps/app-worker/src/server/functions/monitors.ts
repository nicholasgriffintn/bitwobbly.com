import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "@bitwobbly/shared";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  updateMonitor,
  getMonitorById,
} from "../repositories/monitors";
import { getMonitorMetrics } from "../repositories/metrics";
import { clampInt } from "../lib/utils";
import { requireTeam } from "../lib/auth-middleware";
import {
  generateWebhookToken,
  hashWebhookToken,
  randomId,
} from "@bitwobbly/shared";

const MonitorTypeSchema = z.enum([
  "http",
  "http_assert",
  "http_keyword",
  "tls",
  "dns",
  "tcp",
  "heartbeat",
  "webhook",
  "external",
  "manual",
]);

const CreateMonitorSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().optional(),
    group_id: z.string().nullable().optional(),
    interval_seconds: z.number().int(),
    timeout_ms: z.number().int(),
    failure_threshold: z.number().int(),
    type: MonitorTypeSchema.optional(),
    external_config: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const type = data.type || "http";

    const requiresUrl =
      type === "http" ||
      type === "http_assert" ||
      type === "http_keyword" ||
      type === "external";

    const requiresTarget = type === "tls" || type === "dns" || type === "tcp";

    if (requiresUrl) {
      if (!data.url || !z.string().url().safeParse(data.url).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL is required and must be valid for this monitor type",
          path: ["url"],
        });
      }
    } else if (requiresTarget) {
      if (!data.url || !data.url.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Target is required for this monitor type",
          path: ["url"],
        });
      }
    }

    if (data.external_config !== undefined) {
      try {
        JSON.parse(data.external_config);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Config must be valid JSON",
          path: ["external_config"],
        });
      }
    }
  });

export const listMonitorsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const monitors = await listMonitors(db, teamId);
    return { monitors };
  }
);

export const createMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const interval_seconds = clampInt(data.interval_seconds, 30, 3600, 60);
    const timeout_ms = clampInt(data.timeout_ms, 1000, 30000, 8000);
    const failure_threshold = clampInt(data.failure_threshold, 1, 10, 3);

    let webhookToken: string | undefined;
    let webhookTokenHash: string | undefined;

    if (data.type === "webhook" || data.type === "heartbeat") {
      webhookToken = generateWebhookToken();
      webhookTokenHash = await hashWebhookToken(webhookToken);
    }

    const created = await createMonitor(db, teamId, {
      ...data,
      interval_seconds,
      timeout_ms,
      failure_threshold,
      type: data.type || "http",
      webhook_token: webhookTokenHash,
      external_config: data.external_config,
      group_id: data.group_id,
    });

    return {
      ok: true,
      id: created.id,
      webhookToken:
        data.type === "webhook" || data.type === "heartbeat"
          ? webhookToken
          : undefined,
    };
  });

export const deleteMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteMonitor(db, teamId, data.id);
    return { ok: true };
  });

export const getMonitorMetricsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { monitorId: string; hours?: number }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const monitor = await getMonitorById(db, teamId, data.monitorId);
    if (!monitor) {
      throw new Error("Monitor not found or access denied");
    }

    try {
      const hours = Math.min(Math.max(data.hours || 24, 1), 168);
      const result = await getMonitorMetrics(
        vars.CLOUDFLARE_ACCOUNT_ID,
        vars.CLOUDFLARE_API_TOKEN,
        data.monitorId,
        hours
      );
      return result;
    } catch (error) {
      console.error("Failed to fetch metrics", error);
      throw new Error("Failed to fetch metrics");
    }
  });

const UpdateMonitorSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  url: z.string().optional(),
  group_id: z.string().nullable().optional(),
  interval_seconds: z.number().int().optional(),
  timeout_ms: z.number().int().optional(),
  failure_threshold: z.number().int().optional(),
  enabled: z.number().optional(),
  type: MonitorTypeSchema.optional(),
  external_config: z.string().optional(),
});

export const updateMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    if (data.type !== undefined || data.url !== undefined) {
      const current = await getMonitorById(db, teamId, data.id);
      if (!current) throw new Error("Monitor not found or access denied");

      const nextType = data.type || current.type || "http";
      const nextUrl = data.url !== undefined ? data.url : current.url || "";

      const requiresUrl =
        nextType === "http" ||
        nextType === "http_assert" ||
        nextType === "http_keyword" ||
        nextType === "external";

      const requiresTarget =
        nextType === "tls" || nextType === "dns" || nextType === "tcp";

      if (requiresUrl && !z.string().url().safeParse(nextUrl).success) {
        throw new Error(
          "URL is required and must be valid for this monitor type"
        );
      }

      if (requiresTarget && !nextUrl.trim()) {
        throw new Error("Target is required for this monitor type");
      }
    }

    const updates: Parameters<typeof updateMonitor>[3] = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.url !== undefined) updates.url = data.url;
    if (data.group_id !== undefined) updates.group_id = data.group_id;
    if (data.interval_seconds !== undefined)
      updates.interval_seconds = clampInt(data.interval_seconds, 30, 3600, 60);
    if (data.timeout_ms !== undefined)
      updates.timeout_ms = clampInt(data.timeout_ms, 1000, 30000, 8000);
    if (data.failure_threshold !== undefined)
      updates.failure_threshold = clampInt(data.failure_threshold, 1, 10, 3);
    if (data.enabled !== undefined) updates.enabled = data.enabled;
    if (data.type !== undefined) updates.type = data.type;
    if (data.external_config !== undefined)
      updates.external_config = data.external_config;

    if (data.external_config !== undefined) {
      try {
        JSON.parse(data.external_config);
      } catch {
        throw new Error("Config must be valid JSON");
      }
    }

    await updateMonitor(db, teamId, data.id, updates);
    return { ok: true };
  });

export const triggerSchedulerFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireTeam();
    try {
      const schedulerUrl = "http://localhost:8788/cdn-cgi/handler/scheduled";
      const response = await fetch(schedulerUrl, { method: "POST" });

      if (!response.ok) {
        throw new Error(`Scheduler returned ${response.status}`);
      }
      return { ok: true, message: "Scheduler triggered successfully" };
    } catch (error) {
      console.error("[APP] Failed to trigger scheduler:", error);
      throw new Error(
        "Failed to trigger scheduler. Make sure dev server is running."
      );
    }
  }
);

const SetManualStatusSchema = z.object({
  monitorId: z.string(),
  status: z.enum(["up", "down", "degraded"]),
  message: z.string().optional(),
});

export const setManualMonitorStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SetManualStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const monitor = await getMonitorById(db, teamId, data.monitorId);
    if (!monitor) {
      throw new Error("Monitor not found");
    }

    if (monitor.type !== "manual") {
      throw new Error("Only manual monitors can be updated with this endpoint");
    }

    await vars.CHECK_JOBS.send({
      job_id: randomId("job"),
      team_id: monitor.teamId,
      monitor_id: monitor.id,
      monitor_type: "manual",
      url: monitor.url || "",
      timeout_ms: Number(monitor.timeoutMs) || 8000,
      failure_threshold: Number(monitor.failureThreshold) || 3,
      reported_status: data.status,
      reported_reason: data.message,
    });

    return { ok: true };
  });
