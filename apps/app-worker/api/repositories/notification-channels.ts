import { D1Database } from '@cloudflare/workers-types';
import { nowIso, randomId } from '@bitwobbly/shared';

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

export async function createEmailChannel(
  db: D1Database,
  teamId: string,
  input: {
    to: string;
    from?: string;
    subject?: string;
    label?: string;
    enabled?: number;
  },
) {
  const id = randomId('chan');
  const created_at = nowIso();
  const config_json = JSON.stringify({
    to: input.to,
    from: input.from || 'bitwobbly@notifications.nicholasgriffin.dev',
    subject: input.subject || 'BitWobbly Alert',
    label: input.label || input.to,
  });
  const enabled = input.enabled === 0 ? 0 : 1;
  await db
    .prepare(
      `
    INSERT INTO notification_channels (id, team_id, type, config_json, enabled, created_at)
    VALUES (?, ?, 'email', ?, ?, ?)
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
