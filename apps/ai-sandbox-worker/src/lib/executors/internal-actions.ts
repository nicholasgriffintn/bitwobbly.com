import {
  getDb,
  isRecord,
  nowIso,
  randomId,
  schema,
  toFiniteNumber,
  toNonEmptyString,
  type TeamAiAction,
} from "@bitwobbly/shared";
import { and, eq } from "drizzle-orm";

import type { Env } from "../../types/env";

type InternalActionInput = {
  env: Env;
  action: TeamAiAction;
};

async function executeMonitorTuning(
  input: InternalActionInput,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const monitorId = toNonEmptyString(payload.monitorId);
  if (!monitorId) {
    throw new Error("monitor_tuning payload requires monitorId");
  }

  const updates: Partial<typeof schema.monitors.$inferInsert> = {};
  const intervalSeconds = toFiniteNumber(payload.intervalSeconds);
  const failureThreshold = toFiniteNumber(payload.failureThreshold);
  const timeoutMs = toFiniteNumber(payload.timeoutMs);
  if (intervalSeconds !== null) updates.intervalSeconds = intervalSeconds;
  if (failureThreshold !== null) updates.failureThreshold = failureThreshold;
  if (timeoutMs !== null) updates.timeoutMs = timeoutMs;

  if (!Object.keys(updates).length) {
    throw new Error("monitor_tuning payload must include update fields");
  }

  const db = getDb(input.env.DB, { withSentry: true });
  await db
    .update(schema.monitors)
    .set(updates)
    .where(
      and(
        eq(schema.monitors.teamId, input.action.teamId),
        eq(schema.monitors.id, monitorId)
      )
    );

  return { monitorId, updated: true };
}

async function executeNotificationRouting(
  input: InternalActionInput,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const ruleId = toNonEmptyString(payload.ruleId);
  if (!ruleId) {
    throw new Error("notification_routing payload requires ruleId");
  }

  const updates: Partial<typeof schema.alertRules.$inferInsert> = {};
  const channelId = toNonEmptyString(payload.channelId);
  if (channelId) updates.channelId = channelId;
  if (typeof payload.enabled === "boolean") {
    updates.enabled = payload.enabled ? 1 : 0;
  }

  if (!Object.keys(updates).length) {
    throw new Error("notification_routing payload must include update fields");
  }

  const db = getDb(input.env.DB, { withSentry: true });
  await db
    .update(schema.alertRules)
    .set(updates)
    .where(
      and(
        eq(schema.alertRules.teamId, input.action.teamId),
        eq(schema.alertRules.id, ruleId)
      )
    );

  return { ruleId, updated: true };
}

async function executeSentryGroupingUpdate(
  input: InternalActionInput,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const projectId = toNonEmptyString(payload.projectId);
  const fingerprint = toNonEmptyString(payload.fingerprint);
  if (!projectId || !fingerprint) {
    throw new Error(
      "sentry_grouping_update payload requires projectId and fingerprint"
    );
  }

  const id = randomId("igr");
  const db = getDb(input.env.DB, { withSentry: true });
  await db.insert(schema.sentryIssueGroupingRules).values({
    id,
    projectId,
    name: toNonEmptyString(payload.name) ?? `AI rule ${new Date().toISOString()}`,
    enabled: 1,
    matchers: isRecord(payload.matchers) ? payload.matchers : {},
    fingerprint,
    createdAt: nowIso(),
  });

  return { groupingRuleId: id, created: true };
}

async function executeIncidentRunbookUpdate(
  input: InternalActionInput,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const incidentId = toNonEmptyString(payload.incidentId);
  const message = toNonEmptyString(payload.message);
  if (!incidentId || !message) {
    throw new Error("incident_runbook_update requires incidentId and message");
  }

  const status = toNonEmptyString(payload.status) ?? "investigating";
  const id = randomId("iup");
  const db = getDb(input.env.DB, { withSentry: true });
  await db.insert(schema.incidentUpdates).values({
    id,
    incidentId,
    message,
    status,
    createdAt: nowIso(),
  });

  return { incidentUpdateId: id, created: true };
}

export async function executeInternalSandboxAction(
  input: InternalActionInput
): Promise<Record<string, unknown>> {
  const payload = input.action.payload ?? {};

  switch (input.action.actionType) {
    case "monitor_tuning":
      return executeMonitorTuning(input, payload);
    case "notification_routing":
      return executeNotificationRouting(input, payload);
    case "sentry_grouping_update":
      return executeSentryGroupingUpdate(input, payload);
    case "incident_runbook_update":
      return executeIncidentRunbookUpdate(input, payload);
    default:
      throw new Error(
        `Unsupported internal action type: ${input.action.actionType}`
      );
  }
}
