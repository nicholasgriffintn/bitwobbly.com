import type { Env } from './env';
import { json, err, getUrl, readJson, requireAdmin, notFound } from './http';
import {
  ensureDemoTeam,
  listMonitors,
  createMonitor,
  deleteMonitor,
  listStatusPages,
  createStatusPage,
  getStatusPageBySlug,
  rebuildStatusSnapshot,
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

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = getUrl(req);

    // Only API routes are handled here; static assets are served by Workers Assets.
    if (!url.pathname.startsWith('/api/')) {
      return notFound();
    }

    // Always ensure the demo team exists (harmless idempotent).
    ctx.waitUntil(ensureDemoTeam(env.DB, env.PUBLIC_TEAM_ID));

    // Public endpoints
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

      // Cache miss: rebuild
      const snapshot = await rebuildStatusSnapshot(
        env.DB,
        env.KV,
        env.PUBLIC_TEAM_ID,
        slug
      );
      if (!snapshot) return err(404, 'Status page not found.');
      return json(snapshot);
    }

    // Admin-protected routes for writes
    const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
    if (isWrite) {
      const authErr = requireAdmin(req, env.ADMIN_API_TOKEN);
      if (authErr) return authErr;
    }

    // Monitors
    if (req.method === 'GET' && url.pathname === '/api/monitors') {
      const monitors = await listMonitors(env.DB, env.PUBLIC_TEAM_ID);
      return json({ monitors });
    }

    if (req.method === 'POST' && url.pathname === '/api/monitors') {
      const body = await readJson<CreateMonitorBody>(req);
      if (!body?.name || !body?.url)
        return err(400, 'name and url are required.');
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

    // Status pages
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
          'slug must be 2-60 chars: lowercase letters, numbers, hyphen.'
        );

      const created = await createStatusPage(env.DB, env.PUBLIC_TEAM_ID, body);
      // Prime snapshot
      ctx.waitUntil(
        rebuildStatusSnapshot(
          env.DB,
          env.KV,
          env.PUBLIC_TEAM_ID,
          body.slug
        ).then(() => undefined)
      );
      return json({ ok: true, ...created }, { status: 201 });
    }

    // Manual snapshot rebuild endpoint
    if (
      req.method === 'POST' &&
      url.pathname.startsWith('/api/status-pages/') &&
      url.pathname.endsWith('/rebuild')
    ) {
      const parts = url.pathname.split('/');
      const slug = parts[3]; // /api/status-pages/:slug/rebuild
      const page = await getStatusPageBySlug(env.DB, env.PUBLIC_TEAM_ID, slug);
      if (!page) return err(404, 'Status page not found.');
      const snapshot = await rebuildStatusSnapshot(
        env.DB,
        env.KV,
        env.PUBLIC_TEAM_ID,
        slug
      );
      return json({ ok: true, snapshot });
    }

    return notFound();
  },
};
