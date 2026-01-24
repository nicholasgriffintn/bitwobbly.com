import { D1Database } from '@cloudflare/workers-types';
import { nowIso } from '@bitwobbly/shared';

export async function ensureDemoTeam(db: D1Database, teamId: string) {
  await db
    .prepare(
      'INSERT OR IGNORE INTO teams (id, name, created_at) VALUES (?, ?, ?)',
    )
    .bind(teamId, 'Demo Team', nowIso())
    .run();
}
