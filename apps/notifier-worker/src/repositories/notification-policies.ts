import { schema } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export async function getNotificationPoliciesForMonitor(
  db: DrizzleD1Database,
  teamId: string,
  monitorId: string,
) {
  return await db
    .select({
      thresholdFailures: schema.notificationPolicies.thresholdFailures,
      notifyOnRecovery: schema.notificationPolicies.notifyOnRecovery,
      type: schema.notificationChannels.type,
      configJson: schema.notificationChannels.configJson,
    })
    .from(schema.notificationPolicies)
    .innerJoin(
      schema.notificationChannels,
      eq(schema.notificationChannels.id, schema.notificationPolicies.channelId),
    )
    .where(
      and(
        eq(schema.notificationPolicies.teamId, teamId),
        eq(schema.notificationPolicies.monitorId, monitorId),
        eq(schema.notificationChannels.enabled, 1),
      ),
    );
}
