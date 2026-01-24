import { nowIso } from '@bitwobbly/shared';

export async function rebuildAllSnapshots(env: {
  DB: D1Database;
  KV: KVNamespace;
  PUBLIC_TEAM_ID: string;
}) {
  const pages = (
    await env.DB.prepare(
      'SELECT id, slug, name FROM status_pages WHERE team_id = ?'
    )
      .bind(env.PUBLIC_TEAM_ID)
      .all()
  ).results as any[];

  for (const p of pages) {
    await rebuildStatusSnapshot(env, p.id, p.slug, p.name);
  }
}

async function rebuildStatusSnapshot(
  env: { DB: D1Database; KV: KVNamespace; PUBLIC_TEAM_ID: string },
  statusPageId: string,
  slug: string,
  name: string
) {
  const components = (
    await env.DB.prepare(
      `
    SELECT c.id, c.name, c.description
    FROM status_page_components spc
    JOIN components c ON c.id = spc.component_id
    WHERE spc.status_page_id = ?
    ORDER BY spc.sort_order ASC
  `
    )
      .bind(statusPageId)
      .all()
  ).results as any[];

  const compsWithStatus = [];
  for (const c of components) {
    const monitorRows = (
      await env.DB.prepare(
        `
      SELECT ms.last_status
      FROM component_monitors cm
      JOIN monitor_state ms ON ms.monitor_id = cm.monitor_id
      WHERE cm.component_id = ?
    `
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

  const incidents = (
    await env.DB.prepare(
      `
    SELECT * FROM incidents
    WHERE team_id = ? AND status_page_id = ? AND status != 'resolved'
    ORDER BY started_at DESC
  `
    )
      .bind(env.PUBLIC_TEAM_ID, statusPageId)
      .all()
  ).results as any[];

  const incIds = incidents.map((i) => i.id);
  const updates = incIds.length
    ? ((
        await env.DB.prepare(
          `SELECT * FROM incident_updates WHERE incident_id IN (${incIds
            .map(() => '?')
            .join(',')}) ORDER BY created_at ASC`
        )
          .bind(...incIds)
          .all()
      ).results as any[])
    : [];

  const byId = new Map<string, any[]>();
  for (const u of updates) {
    const arr = byId.get(u.incident_id) || [];
    arr.push(u);
    byId.set(u.incident_id, arr);
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    page: { id: statusPageId, name, slug },
    components: compsWithStatus,
    incidents: incidents.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      started_at: i.started_at,
      resolved_at: i.resolved_at,
      updates: (byId.get(i.id) || []).map((u) => ({
        id: u.id,
        message: u.message,
        status: u.status,
        created_at: u.created_at,
      })),
    })),
  };

  await env.KV.put(`status:${slug}`, JSON.stringify(snapshot), {
    expirationTtl: 60,
  });
}

export async function openIncident(
  env: { DB: D1Database },
  teamId: string,
  monitorId: string,
  reason?: string
) {
  const incidentId = `inc_${crypto.randomUUID()}`;
  const started_at = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `
    INSERT INTO incidents (id, team_id, status_page_id, monitor_id, title, status, started_at, resolved_at, created_at)
    VALUES (?, ?, NULL, ?, ?, 'investigating', ?, NULL, ?)
  `
  )
    .bind(incidentId, teamId, monitorId, `Monitor down`, started_at, nowIso())
    .run();

  await env.DB.prepare(
    `
    INSERT INTO incident_updates (id, incident_id, message, status, created_at)
    VALUES (?, ?, ?, 'investigating', ?)
  `
  )
    .bind(
      `up_${crypto.randomUUID()}`,
      incidentId,
      reason || 'Automated monitoring detected an outage.',
      nowIso()
    )
    .run();

  await env.DB.prepare(
    `UPDATE monitor_state SET incident_open = 1, updated_at = ? WHERE monitor_id = ?`
  )
    .bind(nowIso(), monitorId)
    .run();

  return incidentId;
}

export async function resolveIncident(
  env: { DB: D1Database },
  monitorId: string,
  incidentId: string
) {
  const resolved_at = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE incidents SET status = 'resolved', resolved_at = ? WHERE id = ?`
  )
    .bind(resolved_at, incidentId)
    .run();

  await env.DB.prepare(
    `
    INSERT INTO incident_updates (id, incident_id, message, status, created_at)
    VALUES (?, ?, 'Service has recovered.', 'resolved', ?)
  `
  )
    .bind(`up_${crypto.randomUUID()}`, incidentId, nowIso())
    .run();

  await env.DB.prepare(
    `UPDATE monitor_state SET incident_open = 0, updated_at = ? WHERE monitor_id = ?`
  )
    .bind(nowIso(), monitorId)
    .run();
}
