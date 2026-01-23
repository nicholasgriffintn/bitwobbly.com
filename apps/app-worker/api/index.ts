import type { ExecutionContext } from '@cloudflare/workers-types';

import type { Env } from './env';
import { json, err, getUrl, readJson, requireAdmin, notFound } from './http';
import {
  ensureDemoTeam,
  listMonitors,
  createMonitor,
  deleteMonitor,
  listStatusPages,
  createStatusPage,
  getStatusPageById,
  deleteStatusPage,
  getStatusPageBySlug,
  rebuildStatusSnapshot,
  listNotificationChannels,
  createWebhookChannel,
  deleteNotificationChannel,
  listNotificationPolicies,
  createNotificationPolicy,
  deleteNotificationPolicy,
} from './db';
import { clampInt } from './utils';

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
};

type CreateWebhookChannelBody = {
  url: string;
  label?: string;
  enabled?: number;
};

type CreateNotificationPolicyBody = {
  monitor_id: string;
  channel_id: string;
  threshold_failures?: number;
  notify_on_recovery?: number;
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
    const url = getUrl(req);

    if (!url.pathname.startsWith('/api/')) {
      return notFound();
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      let body: LoginBody | null = null;
      try {
        body = await readJson<LoginBody>(req);
      } catch {
        return err(400, 'Invalid JSON body.');
      }
      if (!body?.username || !body?.password)
        return err(400, 'username and password are required.');
      if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.ADMIN_API_TOKEN)
        return err(500, 'Admin auth not configured.');
      if (
        body.username !== env.ADMIN_USERNAME ||
        body.password !== env.ADMIN_PASSWORD
      )
        return err(401, 'Unauthorized.');
      return json({ token: env.ADMIN_API_TOKEN });
    }

    ctx.waitUntil(ensureDemoTeam(env.DB, env.PUBLIC_TEAM_ID));

    if (
      req.method === 'GET' &&
      url.pathname.startsWith('/api/public/status/')
    ) {
      const slug = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (!slug) return err(400, 'Missing slug.');

      const cached = await env.KV.get(`status:${slug}`);
      if (cached) {
        return new Response(cached, {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      const snapshot = await rebuildStatusSnapshot(
        env.DB,
        env.KV,
        env.PUBLIC_TEAM_ID,
        slug,
      );
      if (!snapshot) return err(404, 'Status page not found.');
      return json(snapshot);
    }

    const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
    if (isWrite) {
      const authErr = requireAdmin(req, env.ADMIN_API_TOKEN);
      if (authErr) return authErr;
    }

    if (req.method === 'GET' && url.pathname === '/api/monitors') {
      const monitors = await listMonitors(env.DB, env.PUBLIC_TEAM_ID);
      return json({ monitors });
    }

    if (req.method === 'POST' && url.pathname === '/api/monitors') {
      const body = await readJson<CreateMonitorBody>(req);
      if (!body?.name || !body?.url)
        return err(400, 'name and url are required.');
      try {
        const parsed = new URL(body.url);
        if (!['http:', 'https:'].includes(parsed.protocol))
          return err(400, 'url must be http or https.');
      } catch {
        return err(400, 'url must be a valid URL.');
      }
      const interval_seconds = clampInt(body.interval_seconds, 30, 3600, 60);
      const timeout_ms = clampInt(body.timeout_ms, 1000, 30000, 8000);
      const failure_threshold = clampInt(body.failure_threshold, 1, 10, 3);

      const created = await createMonitor(env.DB, env.PUBLIC_TEAM_ID, {
        ...body,
        interval_seconds,
        timeout_ms,
        failure_threshold,
      });
      return json({ ok: true, ...created }, { status: 201 });
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/monitors/')) {
      const id = url.pathname.split('/').pop()!;
      await deleteMonitor(env.DB, env.PUBLIC_TEAM_ID, id);
      return json({ ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/status-pages') {
      const status_pages = await listStatusPages(env.DB, env.PUBLIC_TEAM_ID);
      return json({ status_pages });
    }

    if (req.method === 'POST' && url.pathname === '/api/status-pages') {
      const body = await readJson<CreateStatusPageBody>(req);
      if (!body?.name || !body?.slug)
        return err(400, 'name and slug are required.');
      if (!/^[a-z0-9-]{2,60}$/.test(body.slug))
        return err(
          400,
          'slug must be 2-60 chars: lowercase letters, numbers, hyphen.',
        );

      const created = await createStatusPage(env.DB, env.PUBLIC_TEAM_ID, body);

      ctx.waitUntil(
        rebuildStatusSnapshot(
          env.DB,
          env.KV,
          env.PUBLIC_TEAM_ID,
          body.slug,
        ).then(() => undefined),
      );
      return json({ ok: true, ...created }, { status: 201 });
    }

    if (
      req.method === 'DELETE' &&
      url.pathname.startsWith('/api/status-pages/')
    ) {
      const id = url.pathname.split('/').pop()!;
      const page = await getStatusPageById(env.DB, env.PUBLIC_TEAM_ID, id);
      if (!page) return err(404, 'Status page not found.');
      await deleteStatusPage(env.DB, env.PUBLIC_TEAM_ID, id);
      await env.KV.delete(`status:${page.slug}`);
      return json({ ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/notification-channels') {
      const channels = await listNotificationChannels(
        env.DB,
        env.PUBLIC_TEAM_ID,
      );
      return json({ channels });
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/notification-channels'
    ) {
      const body = await readJson<CreateWebhookChannelBody>(req);
      if (!body?.url) return err(400, 'url is required.');
      try {
        const url = new URL(body.url);
        if (!['http:', 'https:'].includes(url.protocol))
          return err(400, 'url must be http or https.');
      } catch {
        return err(400, 'url must be a valid URL.');
      }
      const created = await createWebhookChannel(env.DB, env.PUBLIC_TEAM_ID, {
        url: body.url,
        label: body.label,
        enabled: body.enabled,
      });
      return json({ ok: true, ...created }, { status: 201 });
    }

    if (
      req.method === 'DELETE' &&
      url.pathname.startsWith('/api/notification-channels/')
    ) {
      const id = url.pathname.split('/').pop()!;
      await deleteNotificationChannel(env.DB, env.PUBLIC_TEAM_ID, id);
      return json({ ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/notification-policies') {
      const policies = await listNotificationPolicies(
        env.DB,
        env.PUBLIC_TEAM_ID,
      );
      return json({ policies });
    }

    if (
      req.method === 'POST' &&
      url.pathname === '/api/notification-policies'
    ) {
      const body = await readJson<CreateNotificationPolicyBody>(req);
      if (!body?.monitor_id || !body?.channel_id)
        return err(400, 'monitor_id and channel_id are required.');
      const monitor = await env.DB.prepare(
        'SELECT id FROM monitors WHERE team_id = ? AND id = ?',
      )
        .bind(env.PUBLIC_TEAM_ID, body.monitor_id)
        .first();
      if (!monitor) return err(404, 'Monitor not found.');
      const channel = await env.DB.prepare(
        'SELECT id FROM notification_channels WHERE team_id = ? AND id = ?',
      )
        .bind(env.PUBLIC_TEAM_ID, body.channel_id)
        .first();
      if (!channel) return err(404, 'Notification channel not found.');
      const threshold_failures = clampInt(body.threshold_failures, 1, 10, 3);
      const notify_on_recovery = body.notify_on_recovery === 0 ? 0 : 1;
      const created = await createNotificationPolicy(
        env.DB,
        env.PUBLIC_TEAM_ID,
        {
          monitor_id: body.monitor_id,
          channel_id: body.channel_id,
          threshold_failures,
          notify_on_recovery,
        },
      );
      return json({ ok: true, ...created }, { status: 201 });
    }

    if (
      req.method === 'DELETE' &&
      url.pathname.startsWith('/api/notification-policies/')
    ) {
      const id = url.pathname.split('/').pop()!;
      await deleteNotificationPolicy(env.DB, env.PUBLIC_TEAM_ID, id);
      return json({ ok: true });
    }

    if (
      req.method === 'POST' &&
      url.pathname.startsWith('/api/status-pages/') &&
      url.pathname.endsWith('/rebuild')
    ) {
      const parts = url.pathname.split('/');
      const slug = parts[3];
      const page = await getStatusPageBySlug(env.DB, env.PUBLIC_TEAM_ID, slug);
      if (!page) return err(404, 'Status page not found.');
      const snapshot = await rebuildStatusSnapshot(
        env.DB,
        env.KV,
        env.PUBLIC_TEAM_ID,
        slug,
      );
      return json({ ok: true, snapshot });
    }

    return notFound();
  },
};
