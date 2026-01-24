import { D1Database } from '@cloudflare/workers-types';
import { nowIso, randomId } from '@bitwobbly/shared';

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
