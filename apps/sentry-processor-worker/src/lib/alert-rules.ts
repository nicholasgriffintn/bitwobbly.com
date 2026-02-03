import { randomId } from "@bitwobbly/shared";
import type {
  AlertThreshold,
  AlertConditions,
  IssueAlertJob,
} from "@bitwobbly/shared";
import type { schema } from "@bitwobbly/shared";
import type { DB } from "./db";
import type { Env } from "../types/env";
import {
  extractUserId,
  normaliseLevel,
  parseAlertConditions,
  parseAlertThreshold,
} from "./alert-rule-parsers";
import {
  getActiveRulesForProject,
  countEventsInWindow,
  getEventsInWindow,
  getEventsForComparison,
  getAlertRuleState,
  upsertAlertRuleState,
  resolveAlertRuleState,
  insertAlertRuleFire,
  updateRuleLastTriggered,
} from "../repositories/alert-rules";

interface EventContext {
  eventId: string;
  issueId: string;
  projectId: string;
  teamId: string;
  level: string;
  environment?: string | null;
  release?: string | null;
  tags?: Record<string, string> | null;
  eventType: string;
  isNewIssue: boolean;
  wasResolved: boolean;
}

export async function evaluateAlertRules(
  env: Env,
  db: DB,
  context: EventContext,
): Promise<void> {
  const rules = await getActiveRulesForProject(
    db,
    context.projectId,
    context.teamId,
  );
  if (!rules.length) return;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (!triggerMatches(rule, context)) continue;

    const conditions = parseAlertConditions(rule.conditionsJson);
    if (conditions && !conditionsMatch(conditions, context)) continue;

    const threshold = parseAlertThreshold(rule.thresholdJson);

    let severity: "critical" | "warning" | "resolved" = "critical";
    let triggerValue: number | undefined;

    if (
      threshold &&
      (rule.triggerType === "event_threshold" ||
        rule.triggerType === "user_threshold")
    ) {
      const result = await evaluateThreshold(db, context.issueId, threshold);
      severity = result.severity;
      triggerValue = result.value;

      if (severity === "resolved") {
        const now = Math.floor(Date.now() / 1000);
        await resolveAlertRuleState(db, rule.id, context.issueId, now);
        continue;
      }
    }

    if (await shouldRateLimit(db, rule, context.issueId)) continue;

    await fireAlert(
      env,
      db,
      rule,
      context,
      severity,
      triggerValue,
      threshold?.critical,
    );
  }
}

function triggerMatches(
  rule: typeof schema.alertRules.$inferSelect,
  context: EventContext,
): boolean {
  switch (rule.triggerType) {
    case "new_issue":
      return context.isNewIssue;
    case "issue_regression":
      return context.wasResolved;
    case "event_threshold":
    case "user_threshold":
      return true;
    case "status_change":
      return context.isNewIssue || context.wasResolved;
    case "high_priority":
      return context.level === "error" || context.level === "fatal";
    default:
      return false;
  }
}

function conditionsMatch(
  conditions: AlertConditions,
  context: EventContext,
): boolean {
  if (conditions.level?.length) {
    const lvl = normaliseLevel(context.level);
    if (!lvl) return false;
    if (!conditions.level.includes(lvl)) return false;
  }

  if (conditions.environment?.length && context.environment) {
    if (!conditions.environment.includes(context.environment)) {
      return false;
    }
  }

  if (conditions.eventType?.length) {
    const eventType = context.eventType === "transaction" ? "default" : "error";
    if (!conditions.eventType.includes(eventType)) return false;
  }

  if (conditions.tags && context.tags) {
    for (const [key, value] of Object.entries(conditions.tags)) {
      if (context.tags[key] !== value) {
        return false;
      }
    }
  }

  if (conditions.release && context.release) {
    const pattern = conditions.release.replace(/\*/g, ".*");
    const regex = new RegExp(`^${pattern}$`);
    if (!regex.test(context.release)) {
      return false;
    }
  }

  return true;
}

async function evaluateThreshold(
  db: DB,
  issueId: string,
  threshold: AlertThreshold,
): Promise<{ value: number; severity: "critical" | "warning" | "resolved" }> {
  const windowStart = Math.floor(Date.now() / 1000) - threshold.windowSeconds;

  let value: number;
  if (threshold.metric === "count") {
    value = await countEventsInWindow(db, issueId, windowStart);
  } else if (threshold.metric === "count_unique_users") {
    value = await countUniqueUsersInWindow(db, issueId, windowStart);
  } else {
    const events = await countEventsInWindow(db, issueId, windowStart);
    const hours = threshold.windowSeconds / 3600;
    value = hours > 0 ? events / hours : events;
  }

  if (threshold.type === "percent_change") {
    const previousValue = await getComparisonValue(
      db,
      issueId,
      threshold.comparisonWindow || "1d",
    );
    value =
      previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0;
  }

  if (value >= threshold.critical) {
    return { value, severity: "critical" };
  }
  if (threshold.warning !== undefined && value >= threshold.warning) {
    return { value, severity: "warning" };
  }
  if (threshold.resolved !== undefined && value <= threshold.resolved) {
    return { value, severity: "resolved" };
  }
  return { value, severity: "resolved" };
}

async function countUniqueUsersInWindow(
  db: DB,
  issueId: string,
  windowStart: number,
): Promise<number> {
  const events = await getEventsInWindow(db, issueId, windowStart);

  const uniqueUsers = new Set<string>();
  for (const event of events) {
    const userId = extractUserId(event.user);
    if (userId) {
      uniqueUsers.add(userId);
    }
  }
  return uniqueUsers.size;
}

async function getComparisonValue(
  db: DB,
  issueId: string,
  comparisonWindow: "1h" | "1d" | "1w" | "30d",
): Promise<number> {
  const windowSeconds = {
    "1h": 3600,
    "1d": 86400,
    "1w": 604800,
    "30d": 2592000,
  }[comparisonWindow];

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds * 2;
  const windowEnd = now - windowSeconds;

  return await getEventsForComparison(db, issueId, windowStart, windowEnd);
}

async function shouldRateLimit(
  db: DB,
  rule: typeof schema.alertRules.$inferSelect,
  issueId: string,
): Promise<boolean> {
  const state = await getAlertRuleState(db, rule.id, issueId);

  if (!state) return false;

  const now = Math.floor(Date.now() / 1000);
  const cooldownEnds = state.triggeredAt + rule.actionIntervalSeconds;

  return now < cooldownEnds && state.status !== "resolved";
}

async function fireAlert(
  env: Env,
  db: DB,
  rule: typeof schema.alertRules.$inferSelect,
  context: EventContext,
  severity: "critical" | "warning" | "resolved",
  triggerValue?: number,
  threshold?: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await upsertAlertRuleState(db, rule.id, context.issueId, severity, now);

  await insertAlertRuleFire(db, {
    ruleId: rule.id,
    issueId: context.issueId,
    eventId: context.eventId,
    severity,
    triggerReason: buildTriggerReason(
      rule.triggerType,
      triggerValue,
      threshold,
    ),
    firedAt: now,
  });

  await updateRuleLastTriggered(db, rule.id, now);

  const alertJob: IssueAlertJob = {
    type: "issue",
    alert_id: randomId("al"),
    team_id: context.teamId,
    rule_id: rule.id,
    issue_id: context.issueId,
    event_id: context.eventId,
    severity,
    trigger_type: rule.triggerType,
    trigger_value: triggerValue,
    threshold,
    project_id: context.projectId,
    environment: context.environment || undefined,
  };

  await env.ALERT_JOBS.send(alertJob);
}

function buildTriggerReason(
  triggerType: string,
  value?: number,
  threshold?: number,
): string {
  switch (triggerType) {
    case "new_issue":
      return "New issue detected";
    case "issue_regression":
      return "Issue regression detected";
    case "event_threshold":
      return value !== undefined && threshold !== undefined
        ? `Event count ${value} exceeded threshold ${threshold}`
        : "Event threshold exceeded";
    case "user_threshold":
      return value !== undefined && threshold !== undefined
        ? `Unique users ${value} exceeded threshold ${threshold}`
        : "User threshold exceeded";
    case "status_change":
      return "Issue status changed";
    case "high_priority":
      return "High priority error detected";
    default:
      return "Alert triggered";
  }
}
