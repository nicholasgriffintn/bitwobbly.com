import { D1Database } from '@cloudflare/workers-types';
import { nowIso, randomId } from '@bitwobbly/shared';

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
