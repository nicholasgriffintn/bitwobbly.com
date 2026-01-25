import { schema, nowIso, randomId, type DB } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";

export async function listNotificationPolicies(db: DB, teamId: string) {
  return await db
    .select({
      id: schema.notificationPolicies.id,
      teamId: schema.notificationPolicies.teamId,
      monitorId: schema.notificationPolicies.monitorId,
      channelId: schema.notificationPolicies.channelId,
      thresholdFailures: schema.notificationPolicies.thresholdFailures,
      notifyOnRecovery: schema.notificationPolicies.notifyOnRecovery,
      createdAt: schema.notificationPolicies.createdAt,
      channelType: schema.notificationChannels.type,
      channelConfig: schema.notificationChannels.configJson,
      monitorName: schema.monitors.name,
    })
    .from(schema.notificationPolicies)
    .innerJoin(
      schema.notificationChannels,
      eq(schema.notificationChannels.id, schema.notificationPolicies.channelId),
    )
    .innerJoin(
      schema.monitors,
      eq(schema.monitors.id, schema.notificationPolicies.monitorId),
    )
    .where(eq(schema.notificationPolicies.teamId, teamId))
    .orderBy(schema.notificationPolicies.createdAt);
}

export async function createNotificationPolicy(
  db: DB,
  teamId: string,
  input: {
    monitor_id: string;
    channel_id: string;
    threshold_failures: number;
    notify_on_recovery: number;
  },
) {
  const id = randomId("pol");
  await db.insert(schema.notificationPolicies).values({
    id,
    teamId,
    monitorId: input.monitor_id,
    channelId: input.channel_id,
    thresholdFailures: input.threshold_failures,
    notifyOnRecovery: input.notify_on_recovery,
    createdAt: nowIso(),
  });
  return { id };
}

export async function deleteNotificationPolicy(
  db: DB,
  teamId: string,
  policyId: string,
) {
  await db
    .delete(schema.notificationPolicies)
    .where(
      and(
        eq(schema.notificationPolicies.teamId, teamId),
        eq(schema.notificationPolicies.id, policyId),
      ),
    );
}
