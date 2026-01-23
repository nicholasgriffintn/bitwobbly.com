import { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { nowIso, randomId } from '@bitwobbly/shared';

export async function ensureDemoTeam(db: D1Database, teamId: string) {
  await db
    .prepare(
      'INSERT OR IGNORE INTO teams (id, name, created_at) VALUES (?, ?, ?)',
    )
    .bind(teamId, 'Demo Team', nowIso())
    .run();
}

export async function listMonitors(db: D1Database, teamId: string) {
  const monitors = (
    await db
      .prepare(
        'SELECT * FROM monitors WHERE team_id = ? ORDER BY created_at DESC',
      )
      .bind(teamId)
      .all()
  ).results;

  if (!monitors.length) return [];

  const ids = monitors.map((m: any) => m.id);
  const q = `SELECT * FROM monitor_state WHERE monitor_id IN (${ids
    .map(() => '?')
    .join(',')})`;
  const states = (
    await db
      .prepare(q)
      .bind(...ids)
      .all()
  ).results;
  const stateMap = new Map(states.map((s: any) => [s.monitor_id, s]));

  return monitors.map((m: any) => ({
    ...m,
    state: stateMap.get(m.id) || null,
  }));
}

export async function createMonitor(
  db: D1Database,
  teamId: string,
  input: {
    name: string;
    url: string;
    interval_seconds: number;
    timeout_ms: number;
    failure_threshold: number;
  },
) {
  const id = randomId('mon');
  const created_at = nowIso();
  const next_run_at = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `
    INSERT INTO monitors (id, team_id, name, url, method, timeout_ms, interval_seconds, failure_threshold, enabled, next_run_at, created_at)
    VALUES (?, ?, ?, ?, 'GET', ?, ?, ?, 1, ?, ?)
  `,
    )
    .bind(
      id,
      teamId,
      input.name,
      input.url,
      input.timeout_ms,
      input.interval_seconds,
      input.failure_threshold,
      next_run_at,
      created_at,
    )
    .run();

  await db
    .prepare(
      `
    INSERT OR IGNORE INTO monitor_state (monitor_id, last_checked_at, last_status, last_latency_ms, consecutive_failures, last_error, incident_open, updated_at)
    VALUES (?, 0, 'unknown', NULL, 0, NULL, 0, ?)
  `,
    )
    .bind(id, nowIso())
    .run();

  return { id };
}

export async function deleteMonitor(
  db: D1Database,
  teamId: string,
  monitorId: string,
) {
  await db
    .prepare('DELETE FROM monitors WHERE team_id = ? AND id = ?')
    .bind(teamId, monitorId)
    .run();
  await db
    .prepare('DELETE FROM monitor_state WHERE monitor_id = ?')
    .bind(monitorId)
    .run();
}

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
  input: { name: string; slug: string },
) {
  const id = randomId('sp');
  await db
    .prepare(
      `
    INSERT INTO status_pages (id, team_id, slug, name, is_public, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `,
    )
    .bind(id, teamId, input.slug, input.name, nowIso())
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

export async function listOpenIncidents(
  db: D1Database,
  teamId: string,
  statusPageId: string | null,
) {
  const query = statusPageId
    ? "SELECT * FROM incidents WHERE team_id = ? AND status_page_id = ? AND status != 'resolved' ORDER BY started_at DESC"
    : "SELECT * FROM incidents WHERE team_id = ? AND status != 'resolved' ORDER BY started_at DESC";
  const stmt = statusPageId
    ? db.prepare(query).bind(teamId, statusPageId)
    : db.prepare(query).bind(teamId);
  const incs = (await stmt.all()).results as any[];

  if (!incs.length) return [];
  const incIds = incs.map((i) => i.id);
  const q = `SELECT * FROM incident_updates WHERE incident_id IN (${incIds
    .map(() => '?')
    .join(',')}) ORDER BY created_at ASC`;
  const updates = (
    await db
      .prepare(q)
      .bind(...incIds)
      .all()
  ).results as any[];

  const byId = new Map<string, any[]>();
  for (const u of updates) {
    const arr = byId.get(u.incident_id) || [];
    arr.push(u);
    byId.set(u.incident_id, arr);
  }

  return incs.map((i) => ({ ...i, updates: byId.get(i.id) || [] }));
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
    page: { id: page.id, name: page.name, slug: page.slug },
    components: compsWithStatus,
    incidents: incidents.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      started_at: i.started_at,
      resolved_at: i.resolved_at,
      updates: (i.updates || []).map((u: any) => ({
        id: u.id,
        message: u.message,
        status: u.status,
        created_at: u.created_at,
      })),
    })),
  };

  await kv.put(`status:${slug}`, JSON.stringify(snapshot), {
    expirationTtl: 60,
  });
  return snapshot;
}

export async function listNotificationChannels(db: D1Database, teamId: string) {
  return (
    await db
      .prepare(
        'SELECT * FROM notification_channels WHERE team_id = ? ORDER BY created_at DESC',
      )
      .bind(teamId)
      .all()
  ).results;
}

export async function createWebhookChannel(
  db: D1Database,
  teamId: string,
  input: { url: string; label?: string; enabled?: number },
) {
  const id = randomId('chan');
  const created_at = nowIso();
  const config_json = JSON.stringify({
    url: input.url,
    label: input.label || '',
  });
  const enabled = input.enabled === 0 ? 0 : 1;
  await db
    .prepare(
      `
    INSERT INTO notification_channels (id, team_id, type, config_json, enabled, created_at)
    VALUES (?, ?, 'webhook', ?, ?, ?)
  `,
    )
    .bind(id, teamId, config_json, enabled, created_at)
    .run();
  return { id };
}

export async function deleteNotificationChannel(
  db: D1Database,
  teamId: string,
  channelId: string,
) {
  await db
    .prepare(
      'DELETE FROM notification_policies WHERE team_id = ? AND channel_id = ?',
    )
    .bind(teamId, channelId)
    .run();
  await db
    .prepare('DELETE FROM notification_channels WHERE team_id = ? AND id = ?')
    .bind(teamId, channelId)
    .run();
}

export async function listNotificationPolicies(db: D1Database, teamId: string) {
  return (
    await db
      .prepare(
        `
    SELECT np.*, nc.type as channel_type, nc.config_json as channel_config, m.name as monitor_name
    FROM notification_policies np
    JOIN notification_channels nc ON nc.id = np.channel_id
    JOIN monitors m ON m.id = np.monitor_id
    WHERE np.team_id = ?
    ORDER BY np.created_at DESC
  `,
      )
      .bind(teamId)
      .all()
  ).results;
}

export async function createNotificationPolicy(
  db: D1Database,
  teamId: string,
  input: {
    monitor_id: string;
    channel_id: string;
    threshold_failures: number;
    notify_on_recovery: number;
  },
) {
  const id = randomId('pol');
  const created_at = nowIso();
  await db
    .prepare(
      `
    INSERT INTO notification_policies (id, team_id, monitor_id, channel_id, threshold_failures, notify_on_recovery, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .bind(
      id,
      teamId,
      input.monitor_id,
      input.channel_id,
      input.threshold_failures,
      input.notify_on_recovery,
      created_at,
    )
    .run();
  return { id };
}

export async function deleteNotificationPolicy(
  db: D1Database,
  teamId: string,
  policyId: string,
) {
  await db
    .prepare('DELETE FROM notification_policies WHERE team_id = ? AND id = ?')
    .bind(teamId, policyId)
    .run();
}
