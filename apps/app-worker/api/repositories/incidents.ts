import { D1Database } from '@cloudflare/workers-types';

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
