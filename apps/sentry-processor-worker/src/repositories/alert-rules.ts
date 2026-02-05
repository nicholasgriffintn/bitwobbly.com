import { schema, randomId } from "@bitwobbly/shared";
import { eq, and, gte, isNull, or } from "drizzle-orm";
import type { DB } from "@bitwobbly/shared";

export async function getProjectTeamId(db: DB, projectId: string) {
  const results = await db
    .select({ teamId: schema.sentryProjects.teamId })
    .from(schema.sentryProjects)
    .where(eq(schema.sentryProjects.id, projectId))
    .limit(1);
  return results[0]?.teamId || null;
}

export async function getActiveRulesForProject(
  db: DB,
  projectId: string,
  teamId: string
) {
  return await db
    .select()
    .from(schema.alertRules)
    .where(
      and(
        eq(schema.alertRules.teamId, teamId),
        eq(schema.alertRules.sourceType, "issue"),
        eq(schema.alertRules.enabled, 1),
        or(
          eq(schema.alertRules.projectId, projectId),
          isNull(schema.alertRules.projectId)
        )
      )
    );
}

export async function countEventsInWindow(
  db: DB,
  issueId: string,
  windowStart: number
) {
  const result = await db
    .select()
    .from(schema.sentryEvents)
    .where(
      and(
        eq(schema.sentryEvents.issueId, issueId),
        gte(schema.sentryEvents.receivedAt, windowStart)
      )
    );
  return result.length;
}

export async function getEventsInWindow(
  db: DB,
  issueId: string,
  windowStart: number
) {
  return await db
    .select({ user: schema.sentryEvents.user })
    .from(schema.sentryEvents)
    .where(
      and(
        eq(schema.sentryEvents.issueId, issueId),
        gte(schema.sentryEvents.receivedAt, windowStart)
      )
    );
}

export async function getEventsForComparison(
  db: DB,
  issueId: string,
  windowStart: number,
  windowEnd: number
) {
  const result = await db
    .select()
    .from(schema.sentryEvents)
    .where(
      and(
        eq(schema.sentryEvents.issueId, issueId),
        gte(schema.sentryEvents.receivedAt, windowStart)
      )
    );
  return result.filter((e) => e.receivedAt < windowEnd).length;
}

export async function getAlertRuleState(
  db: DB,
  ruleId: string,
  issueId: string
) {
  const results = await db
    .select()
    .from(schema.alertRuleStates)
    .where(
      and(
        eq(schema.alertRuleStates.ruleId, ruleId),
        eq(schema.alertRuleStates.issueId, issueId)
      )
    )
    .limit(1);
  return results[0] || null;
}

export async function upsertAlertRuleState(
  db: DB,
  ruleId: string,
  issueId: string,
  status: string,
  triggeredAt: number
) {
  const existing = await getAlertRuleState(db, ruleId, issueId);

  if (existing) {
    await db
      .update(schema.alertRuleStates)
      .set({
        status,
        triggeredAt,
        resolvedAt: null,
      })
      .where(eq(schema.alertRuleStates.id, existing.id));
  } else {
    await db.insert(schema.alertRuleStates).values({
      id: randomId("als"),
      ruleId,
      issueId,
      status,
      triggeredAt,
    });
  }
}

export async function resolveAlertRuleState(
  db: DB,
  ruleId: string,
  issueId: string,
  resolvedAt: number
) {
  await db
    .update(schema.alertRuleStates)
    .set({
      status: "resolved",
      resolvedAt,
    })
    .where(
      and(
        eq(schema.alertRuleStates.ruleId, ruleId),
        eq(schema.alertRuleStates.issueId, issueId)
      )
    );
}

export async function insertAlertRuleFire(
  db: DB,
  data: {
    ruleId: string;
    issueId: string;
    eventId: string;
    severity: string;
    triggerReason: string;
    firedAt: number;
  }
) {
  await db.insert(schema.alertRuleFires).values({
    id: randomId("alf"),
    ruleId: data.ruleId,
    issueId: data.issueId,
    eventId: data.eventId,
    severity: data.severity,
    triggerReason: data.triggerReason,
    firedAt: data.firedAt,
  });
}

export async function updateRuleLastTriggered(
  db: DB,
  ruleId: string,
  lastTriggeredAt: number
) {
  await db
    .update(schema.alertRules)
    .set({ lastTriggeredAt })
    .where(eq(schema.alertRules.id, ruleId));
}
