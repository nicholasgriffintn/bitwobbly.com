import { schema, nowIso, randomId } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export async function listNotificationChannels(
  db: DrizzleD1Database,
  teamId: string,
) {
  return await db
    .select()
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.teamId, teamId))
    .orderBy(schema.notificationChannels.createdAt);
}

export async function createWebhookChannel(
  db: DrizzleD1Database,
  teamId: string,
  input: { url: string; label?: string; enabled?: number },
) {
  const id = randomId("chan");
  const config_json = JSON.stringify({
    url: input.url,
    label: input.label || "",
  });
  const enabled = input.enabled === 0 ? 0 : 1;
  await db.insert(schema.notificationChannels).values({
    id,
    teamId,
    type: "webhook",
    configJson: config_json,
    enabled,
    createdAt: nowIso(),
  });
  return { id };
}

export async function createEmailChannel(
  db: DrizzleD1Database,
  teamId: string,
  input: {
    to: string;
    from?: string;
    subject?: string;
    label?: string;
    enabled?: number;
  },
) {
  const id = randomId("chan");
  const config_json = JSON.stringify({
    to: input.to,
    from: input.from || "bitwobbly@notifications.nicholasgriffin.dev",
    subject: input.subject || "BitWobbly Alert",
    label: input.label || input.to,
  });
  const enabled = input.enabled === 0 ? 0 : 1;
  await db.insert(schema.notificationChannels).values({
    id,
    teamId,
    type: "email",
    configJson: config_json,
    enabled,
    createdAt: nowIso(),
  });
  return { id };
}

export async function deleteNotificationChannel(
  db: DrizzleD1Database,
  teamId: string,
  channelId: string,
) {
  await db
    .delete(schema.notificationPolicies)
    .where(
      and(
        eq(schema.notificationPolicies.teamId, teamId),
        eq(schema.notificationPolicies.channelId, channelId),
      ),
    );
  await db
    .delete(schema.notificationChannels)
    .where(
      and(
        eq(schema.notificationChannels.teamId, teamId),
        eq(schema.notificationChannels.id, channelId),
      ),
    );
}

export async function notificationChannelExists(
  db: DrizzleD1Database,
  teamId: string,
  channelId: string,
): Promise<boolean> {
  const channel = await db
    .select({ id: schema.notificationChannels.id })
    .from(schema.notificationChannels)
    .where(
      and(
        eq(schema.notificationChannels.teamId, teamId),
        eq(schema.notificationChannels.id, channelId),
      ),
    )
    .limit(1);

  return channel.length > 0;
}
