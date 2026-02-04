import { schema } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";

import type { DB } from "../lib/db";

export async function getAlertRuleById(db: DB, ruleId: string) {
  const results = await db
    .select()
    .from(schema.alertRules)
    .where(eq(schema.alertRules.id, ruleId))
    .limit(1);
  return results[0] || null;
}

export async function getChannelById(db: DB, channelId: string) {
  const results = await db
    .select()
    .from(schema.notificationChannels)
    .where(
      and(
        eq(schema.notificationChannels.id, channelId),
        eq(schema.notificationChannels.enabled, 1)
      )
    )
    .limit(1);
  return results[0] || null;
}

export async function getIssueById(db: DB, issueId: string) {
  const results = await db
    .select()
    .from(schema.sentryIssues)
    .where(eq(schema.sentryIssues.id, issueId))
    .limit(1);
  return results[0] || null;
}

export async function getProjectById(db: DB, projectId: string) {
  const results = await db
    .select()
    .from(schema.sentryProjects)
    .where(eq(schema.sentryProjects.id, projectId))
    .limit(1);
  return results[0] || null;
}

export async function getAlertRulesForMonitor(
  db: DB,
  monitorId: string,
  triggerType: string
) {
  return await db
    .select()
    .from(schema.alertRules)
    .where(
      and(
        eq(schema.alertRules.monitorId, monitorId),
        eq(schema.alertRules.sourceType, "monitor"),
        eq(schema.alertRules.triggerType, triggerType),
        eq(schema.alertRules.enabled, 1)
      )
    );
}
