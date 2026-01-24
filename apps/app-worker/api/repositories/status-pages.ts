import { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { nowIso, randomId } from '@bitwobbly/shared';

import { listOpenIncidents } from './incidents.js';

export async function listStatusPages(db: D1Database, teamId: string) {
  return (
    await db
      .prepare(
        'SELECT * FROM status_pages WHERE team_id = ? ORDER BY created_at DESC',
      )
      .bind(teamId)
      .all()
  ).results;
}

export async function createStatusPage(
  db: D1Database,
  teamId: string,
  input: {
    name: string;
    slug: string;
    logo_url?: string;
    brand_color?: string;
    custom_css?: string;
  },
) {
  const id = randomId('sp');
  await db
    .prepare(
      `
    INSERT INTO status_pages (id, team_id, slug, name, is_public, logo_url, brand_color, custom_css, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
  `,
    )
    .bind(
      id,
      teamId,
      input.slug,
      input.name,
      input.logo_url || null,
      input.brand_color || '#007bff',
      input.custom_css || null,
      nowIso(),
    )
    .run();
  return { id };
}

export async function getStatusPageById(
  db: D1Database,
  teamId: string,
  id: string,
) {
  const row = (await db
    .prepare('SELECT * FROM status_pages WHERE team_id = ? AND id = ?')
    .bind(teamId, id)
    .first()) as any;
  return row || null;
}

export async function getStatusPageBySlug(
  db: D1Database,
  teamId: string,
  slug: string,
) {
  const row = (await db
    .prepare('SELECT * FROM status_pages WHERE team_id = ? AND slug = ?')
    .bind(teamId, slug)
    .first()) as any;
  return row || null;
}

export async function deleteStatusPage(
  db: D1Database,
  teamId: string,
  statusPageId: string,
) {
  await db
    .prepare('DELETE FROM status_page_components WHERE status_page_id = ?')
    .bind(statusPageId)
    .run();
  await db
    .prepare('DELETE FROM status_pages WHERE team_id = ? AND id = ?')
    .bind(teamId, statusPageId)
    .run();
}

export async function listComponentsForStatusPage(
  db: D1Database,
  statusPageId: string,
) {
  const rows = (
    await db
      .prepare(
        `
    SELECT c.id, c.name, c.description
    FROM status_page_components spc
    JOIN components c ON c.id = spc.component_id
    WHERE spc.status_page_id = ?
    ORDER BY spc.sort_order ASC
  `,
      )
      .bind(statusPageId)
      .all()
  ).results as any[];
  return rows || [];
}

export async function rebuildStatusSnapshot(
  db: D1Database,
  kv: KVNamespace,
  teamId: string,
  slug: string,
) {
  const page = await getStatusPageBySlug(db, teamId, slug);
  if (!page) return null;

  const components = await listComponentsForStatusPage(db, page.id);
  const compsWithStatus = [];

  for (const c of components) {
    const monitorRows = (
      await db
        .prepare(
          `
      SELECT ms.last_status
      FROM component_monitors cm
      JOIN monitor_state ms ON ms.monitor_id = cm.monitor_id
      WHERE cm.component_id = ?
    `,
        )
        .bind(c.id)
        .all()
    ).results as any[];

    let status: 'up' | 'down' | 'unknown' = 'unknown';
    if (monitorRows.length)
      status = monitorRows.some((r) => r.last_status === 'down')
        ? 'down'
        : 'up';

    compsWithStatus.push({ ...c, status });
  }

  const incidents = await listOpenIncidents(db, teamId, page.id);

  const snapshot = {
    generated_at: new Date().toISOString(),
    page: {
      id: page.id,
      name: page.name,
      slug: page.slug,
      logo_url: page.logo_url,
      brand_color: page.brand_color,
      custom_css: page.custom_css,
    },
    components: compsWithStatus,
    incidents: incidents.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      started_at: i.started_at,
      resolved_at: i.resolved_at,
      updates: (i.updates || []).map((u: unknown) => {
        const update = u as Record<string, unknown>;
        return {
          id: update.id,
          message: update.message,
          status: update.status,
          created_at: update.created_at,
        };
      }),
    })),
  };

  await kv.put(`status:${slug}`, JSON.stringify(snapshot), {
    expirationTtl: 60,
  });
  return snapshot;
}
