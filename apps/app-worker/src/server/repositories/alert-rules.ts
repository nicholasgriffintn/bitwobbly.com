import { schema, nowIso, randomId, type DB } from "@bitwobbly/shared";
import { eq, and, desc } from "drizzle-orm";

export interface CreateAlertRuleInput {
  name: string;
  enabled?: number;
  sourceType: string;
  projectId?: string | null;
  monitorId?: string | null;
  environment?: string | null;
  triggerType: string;
  conditionsJson?: string | null;
  thresholdJson?: string | null;
  channelId: string;
  actionIntervalSeconds?: number;
  ownerId?: string | null;
}

export interface UpdateAlertRuleInput {
  name?: string;
  enabled?: number;
  projectId?: string | null;
  monitorId?: string | null;
  environment?: string | null;
  triggerType?: string;
  conditionsJson?: string | null;
  thresholdJson?: string | null;
  channelId?: string;
  actionIntervalSeconds?: number;
  ownerId?: string | null;
}

export async function listAlertRules(db: DB, teamId: string) {
  return await db
    .select({
      id: schema.alertRules.id,
      teamId: schema.alertRules.teamId,
      name: schema.alertRules.name,
      enabled: schema.alertRules.enabled,
      sourceType: schema.alertRules.sourceType,
      projectId: schema.alertRules.projectId,
      monitorId: schema.alertRules.monitorId,
      environment: schema.alertRules.environment,
      triggerType: schema.alertRules.triggerType,
      conditionsJson: schema.alertRules.conditionsJson,
      thresholdJson: schema.alertRules.thresholdJson,
      channelId: schema.alertRules.channelId,
      actionIntervalSeconds: schema.alertRules.actionIntervalSeconds,
      lastTriggeredAt: schema.alertRules.lastTriggeredAt,
      ownerId: schema.alertRules.ownerId,
      createdAt: schema.alertRules.createdAt,
      channelType: schema.notificationChannels.type,
      channelConfig: schema.notificationChannels.configJson,
      monitorName: schema.monitors.name,
    })
    .from(schema.alertRules)
    .innerJoin(
      schema.notificationChannels,
      eq(schema.notificationChannels.id, schema.alertRules.channelId),
    )
    .leftJoin(
      schema.monitors,
      eq(schema.monitors.id, schema.alertRules.monitorId),
    )
    .where(eq(schema.alertRules.teamId, teamId))
    .orderBy(desc(schema.alertRules.createdAt));
}

export async function getAlertRuleById(db: DB, teamId: string, ruleId: string) {
  const results = await db
    .select()
    .from(schema.alertRules)
    .where(
      and(
        eq(schema.alertRules.teamId, teamId),
        eq(schema.alertRules.id, ruleId),
      ),
    )
    .limit(1);
  return results[0] || null;
}

export async function createAlertRule(
  db: DB,
  teamId: string,
  input: CreateAlertRuleInput,
) {
  const id = randomId("rul");
  await db.insert(schema.alertRules).values({
    id,
    teamId,
    name: input.name,
    enabled: input.enabled ?? 1,
    sourceType: input.sourceType,
    projectId: input.projectId || null,
    monitorId: input.monitorId || null,
    environment: input.environment || null,
    triggerType: input.triggerType,
    conditionsJson: input.conditionsJson || null,
    thresholdJson: input.thresholdJson || null,
    channelId: input.channelId,
    actionIntervalSeconds: input.actionIntervalSeconds ?? 3600,
    ownerId: input.ownerId || null,
    createdAt: nowIso(),
  });
  return { id };
}

export async function updateAlertRule(
  db: DB,
  teamId: string,
  ruleId: string,
  input: UpdateAlertRuleInput,
) {
  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) updates.name = input.name;
  if (input.enabled !== undefined) updates.enabled = input.enabled;
  if (input.projectId !== undefined) updates.projectId = input.projectId;
  if (input.environment !== undefined) updates.environment = input.environment;
  if (input.triggerType !== undefined) updates.triggerType = input.triggerType;
  if (input.conditionsJson !== undefined)
    updates.conditionsJson = input.conditionsJson;
  if (input.thresholdJson !== undefined)
    updates.thresholdJson = input.thresholdJson;
  if (input.channelId !== undefined) updates.channelId = input.channelId;
  if (input.actionIntervalSeconds !== undefined)
    updates.actionIntervalSeconds = input.actionIntervalSeconds;
  if (input.ownerId !== undefined) updates.ownerId = input.ownerId;

  if (Object.keys(updates).length === 0) return;

  await db
    .update(schema.alertRules)
    .set(updates)
    .where(
      and(
        eq(schema.alertRules.teamId, teamId),
        eq(schema.alertRules.id, ruleId),
      ),
    );
}

export async function deleteAlertRule(db: DB, teamId: string, ruleId: string) {
  await db
    .delete(schema.alertRuleStates)
    .where(eq(schema.alertRuleStates.ruleId, ruleId));

  await db
    .delete(schema.alertRuleFires)
    .where(eq(schema.alertRuleFires.ruleId, ruleId));

  await db
    .delete(schema.alertRules)
    .where(
      and(
        eq(schema.alertRules.teamId, teamId),
        eq(schema.alertRules.id, ruleId),
      ),
    );
}

export async function listAlertRuleFires(
  db: DB,
  teamId: string,
  ruleId?: string,
  limit = 50,
) {
  const query = db
    .select({
      id: schema.alertRuleFires.id,
      ruleId: schema.alertRuleFires.ruleId,
      ruleName: schema.alertRules.name,
      issueId: schema.alertRuleFires.issueId,
      eventId: schema.alertRuleFires.eventId,
      severity: schema.alertRuleFires.severity,
      triggerReason: schema.alertRuleFires.triggerReason,
      firedAt: schema.alertRuleFires.firedAt,
    })
    .from(schema.alertRuleFires)
    .innerJoin(
      schema.alertRules,
      eq(schema.alertRules.id, schema.alertRuleFires.ruleId),
    )
    .where(
      ruleId
        ? and(
            eq(schema.alertRules.teamId, teamId),
            eq(schema.alertRuleFires.ruleId, ruleId),
          )
        : eq(schema.alertRules.teamId, teamId),
    )
    .orderBy(desc(schema.alertRuleFires.firedAt))
    .limit(limit);

  return await query;
}

export async function toggleAlertRule(
  db: DB,
  teamId: string,
  ruleId: string,
  enabled: boolean,
) {
  await db
    .update(schema.alertRules)
    .set({ enabled: enabled ? 1 : 0 })
    .where(
      and(
        eq(schema.alertRules.teamId, teamId),
        eq(schema.alertRules.id, ruleId),
      ),
    );
}
