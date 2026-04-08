import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { toBoolFlag, toDbFlag } from "../lib/db-utils.ts";
import { clampInt, nowIso, randomId } from "../lib/utils.ts";
import {
  DEFAULT_ACTION_BLOCKLIST,
  DEFAULT_ACTION_EGRESS_ALLOWLIST,
  DEFAULT_AI_ACTIONS_ENABLED,
  DEFAULT_AI_EXECUTION_MODE,
  DEFAULT_GITHUB_AUTOFIX_ENABLED,
  DEFAULT_LOW_RISK_AUTO_ENABLED,
} from "./constants.ts";
import {
  parseTeamAiActionDecision,
  parseTeamAiActionRiskTier,
  parseTeamAiActionRunStatus,
  parseTeamAiActionStatus,
  parseTeamAiActionType,
  parseTeamAiExecutionMode,
  sanitiseHostnameAllowlist,
} from "./action-schemas.ts";
import type {
  TeamAiAction,
  TeamAiActionAttempt,
  TeamAiActionEvent,
  TeamAiActionGateDecision,
  TeamAiActionPlan,
  TeamAiActionPolicy,
  TeamAiActionPolicyUpdate,
  TeamAiActionRiskTier,
  TeamAiActionRun,
  TeamAiActionRunStatus,
  TeamAiActionStatus,
  TeamAiActionType,
  TeamAiGithubInstallation,
  TeamAiGithubRepoMapping,
  TeamAiGithubRepoMappingInput,
} from "./types.ts";

const MIN_MAX_FILES_CHANGED = 1;
const MAX_MAX_FILES_CHANGED = 100;
const MIN_MAX_PATCH_BYTES = 1_024;
const MAX_MAX_PATCH_BYTES = 1_000_000;

function toStringArray(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return Array.from(fallback);
  }

  const collected = value.filter((item): item is string => typeof item === "string");
  if (!collected.length) {
    return Array.from(fallback);
  }

  return Array.from(new Set(collected.map((item) => item.trim()).filter(Boolean))).sort();
}

export function buildDefaultTeamAiActionPolicy(teamId: string): TeamAiActionPolicy {
  return {
    teamId,
    autoActionsEnabled: DEFAULT_AI_ACTIONS_ENABLED,
    executionMode: DEFAULT_AI_EXECUTION_MODE,
    lowRiskAutoEnabled: DEFAULT_LOW_RISK_AUTO_ENABLED,
    blockedActionTypes: Array.from(DEFAULT_ACTION_BLOCKLIST),
    egressAllowlist: Array.from(DEFAULT_ACTION_EGRESS_ALLOWLIST),
    githubAutofixEnabled: DEFAULT_GITHUB_AUTOFIX_ENABLED,
    createdAt: null,
    updatedAt: null,
  };
}

function toPolicy(
  row: typeof schema.teamAiActionPolicies.$inferSelect | null | undefined,
  teamId: string
): TeamAiActionPolicy {
  if (!row) return buildDefaultTeamAiActionPolicy(teamId);

  return {
    teamId: row.teamId,
    autoActionsEnabled: toBoolFlag(row.autoActionsEnabled),
    executionMode: parseTeamAiExecutionMode(row.executionMode),
    lowRiskAutoEnabled: toBoolFlag(row.lowRiskAutoEnabled),
    blockedActionTypes: toStringArray(
      row.blockedActionTypesJson,
      DEFAULT_ACTION_BLOCKLIST
    ).map((value) => parseTeamAiActionType(value)),
    egressAllowlist: sanitiseHostnameAllowlist(
      toStringArray(row.egressAllowlistJson, DEFAULT_ACTION_EGRESS_ALLOWLIST)
    ),
    githubAutofixEnabled: toBoolFlag(row.githubAutofixEnabled),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

export async function getTeamAiActionPolicy(
  db: DB,
  teamId: string
): Promise<TeamAiActionPolicy> {
  const rows = await db
    .select()
    .from(schema.teamAiActionPolicies)
    .where(eq(schema.teamAiActionPolicies.teamId, teamId))
    .limit(1);

  return toPolicy(rows[0], teamId);
}

function toPolicyInsert(
  teamId: string,
  update: TeamAiActionPolicyUpdate,
  now: string
): typeof schema.teamAiActionPolicies.$inferInsert {
  const base = buildDefaultTeamAiActionPolicy(teamId);
  return {
    teamId,
    autoActionsEnabled: toDbFlag(update.autoActionsEnabled ?? base.autoActionsEnabled) ?? 1,
    executionMode: update.executionMode ?? base.executionMode,
    lowRiskAutoEnabled:
      toDbFlag(update.lowRiskAutoEnabled ?? base.lowRiskAutoEnabled) ?? 1,
    blockedActionTypesJson: update.blockedActionTypes
      ? Array.from(new Set(update.blockedActionTypes)).sort()
      : base.blockedActionTypes,
    egressAllowlistJson: update.egressAllowlist
      ? sanitiseHostnameAllowlist(update.egressAllowlist)
      : base.egressAllowlist,
    githubAutofixEnabled:
      toDbFlag(update.githubAutofixEnabled ?? base.githubAutofixEnabled) ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

function toPolicyUpdate(
  update: TeamAiActionPolicyUpdate,
  now: string
): Partial<typeof schema.teamAiActionPolicies.$inferInsert> {
  const changes: Partial<typeof schema.teamAiActionPolicies.$inferInsert> = {
    updatedAt: now,
  };

  if (update.autoActionsEnabled !== undefined) {
    changes.autoActionsEnabled = toDbFlag(update.autoActionsEnabled);
  }
  if (update.executionMode !== undefined) {
    changes.executionMode = update.executionMode;
  }
  if (update.lowRiskAutoEnabled !== undefined) {
    changes.lowRiskAutoEnabled = toDbFlag(update.lowRiskAutoEnabled);
  }
  if (update.blockedActionTypes !== undefined) {
    changes.blockedActionTypesJson = Array.from(
      new Set(update.blockedActionTypes)
    ).sort();
  }
  if (update.egressAllowlist !== undefined) {
    changes.egressAllowlistJson = sanitiseHostnameAllowlist(update.egressAllowlist);
  }
  if (update.githubAutofixEnabled !== undefined) {
    changes.githubAutofixEnabled = toDbFlag(update.githubAutofixEnabled);
  }

  return changes;
}

export async function upsertTeamAiActionPolicy(
  db: DB,
  teamId: string,
  update: TeamAiActionPolicyUpdate
): Promise<TeamAiActionPolicy> {
  const now = nowIso();
  const existing = await db
    .select()
    .from(schema.teamAiActionPolicies)
    .where(eq(schema.teamAiActionPolicies.teamId, teamId))
    .limit(1);

  if (!existing.length) {
    await db
      .insert(schema.teamAiActionPolicies)
      .values(toPolicyInsert(teamId, update, now));
  } else {
    await db
      .update(schema.teamAiActionPolicies)
      .set(toPolicyUpdate(update, now))
      .where(eq(schema.teamAiActionPolicies.teamId, teamId));
  }

  return getTeamAiActionPolicy(db, teamId);
}

function toActionRun(
  row: typeof schema.teamAiActionRuns.$inferSelect
): TeamAiActionRun {
  return {
    id: row.id,
    teamId: row.teamId,
    triggerSource: row.triggerSource as TeamAiActionRun["triggerSource"],
    triggerType: row.triggerType as TeamAiActionRun["triggerType"],
    triggerId: row.triggerId,
    status: parseTeamAiActionRunStatus(row.status),
    snapshot: row.snapshotJson ?? null,
    plan: (row.planJson ?? null) as TeamAiActionPlan | null,
    policy: (row.policyJson ?? null) as TeamAiActionPolicy | null,
    blockedReason: row.blockedReason ?? null,
    error: row.error ?? null,
    cancelledAt: row.cancelledAt ?? null,
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createTeamAiActionRun(
  db: DB,
  input: {
    teamId: string;
    triggerSource: TeamAiActionRun["triggerSource"];
    triggerType: TeamAiActionRun["triggerType"];
    triggerId: string;
    status?: TeamAiActionRunStatus;
    snapshot?: Record<string, unknown> | null;
    plan?: TeamAiActionPlan | null;
    policy?: TeamAiActionPolicy | null;
    blockedReason?: string | null;
    error?: string | null;
  }
): Promise<TeamAiActionRun> {
  const now = nowIso();
  const run: typeof schema.teamAiActionRuns.$inferInsert = {
    id: randomId("tair"),
    teamId: input.teamId,
    triggerSource: input.triggerSource,
    triggerType: input.triggerType,
    triggerId: input.triggerId,
    status: input.status ?? "planning",
    snapshotJson: input.snapshot ?? null,
    planJson: (input.plan ?? null) as Record<string, unknown> | null,
    policyJson: (input.policy ?? null) as Record<string, unknown> | null,
    blockedReason: input.blockedReason ?? null,
    error: input.error ?? null,
    cancelledAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.teamAiActionRuns).values(run);
  return toActionRun(run as typeof schema.teamAiActionRuns.$inferSelect);
}

export async function listTeamAiActionRuns(
  db: DB,
  teamId: string,
  options: { limit?: number } = {}
): Promise<TeamAiActionRun[]> {
  const limit = clampInt(options.limit ?? 20, 1, 100);
  const rows = await db
    .select()
    .from(schema.teamAiActionRuns)
    .where(eq(schema.teamAiActionRuns.teamId, teamId))
    .orderBy(desc(schema.teamAiActionRuns.createdAt))
    .limit(limit);

  return rows.map((row) => toActionRun(row));
}

export async function getTeamAiActionRun(
  db: DB,
  teamId: string,
  runId: string
): Promise<TeamAiActionRun | null> {
  const rows = await db
    .select()
    .from(schema.teamAiActionRuns)
    .where(
      and(
        eq(schema.teamAiActionRuns.teamId, teamId),
        eq(schema.teamAiActionRuns.id, runId)
      )
    )
    .limit(1);

  return rows[0] ? toActionRun(rows[0]) : null;
}

export async function findTeamAiActionRunByTrigger(
  db: DB,
  input: {
    teamId: string;
    triggerSource: TeamAiActionRun["triggerSource"];
    triggerType: TeamAiActionRun["triggerType"];
    triggerId: string;
  }
): Promise<TeamAiActionRun | null> {
  const rows = await db
    .select()
    .from(schema.teamAiActionRuns)
    .where(
      and(
        eq(schema.teamAiActionRuns.teamId, input.teamId),
        eq(schema.teamAiActionRuns.triggerSource, input.triggerSource),
        eq(schema.teamAiActionRuns.triggerType, input.triggerType),
        eq(schema.teamAiActionRuns.triggerId, input.triggerId)
      )
    )
    .limit(1);

  return rows[0] ? toActionRun(rows[0]) : null;
}

export async function updateTeamAiActionRun(
  db: DB,
  input: {
    teamId: string;
    runId: string;
    status?: TeamAiActionRunStatus;
    snapshot?: Record<string, unknown> | null;
    plan?: TeamAiActionPlan | null;
    policy?: TeamAiActionPolicy | null;
    blockedReason?: string | null;
    error?: string | null;
    cancelledAt?: string | null;
    completedAt?: string | null;
  }
): Promise<void> {
  const patch: Partial<typeof schema.teamAiActionRuns.$inferInsert> = {
    updatedAt: nowIso(),
  };

  if (input.status !== undefined) patch.status = input.status;
  if (input.snapshot !== undefined) patch.snapshotJson = input.snapshot;
  if (input.plan !== undefined) {
    patch.planJson = input.plan as unknown as Record<string, unknown> | null;
  }
  if (input.policy !== undefined) {
    patch.policyJson = input.policy as unknown as Record<string, unknown> | null;
  }
  if (input.blockedReason !== undefined) patch.blockedReason = input.blockedReason;
  if (input.error !== undefined) patch.error = input.error;
  if (input.cancelledAt !== undefined) patch.cancelledAt = input.cancelledAt;
  if (input.completedAt !== undefined) patch.completedAt = input.completedAt;

  await db
    .update(schema.teamAiActionRuns)
    .set(patch)
    .where(
      and(
        eq(schema.teamAiActionRuns.teamId, input.teamId),
        eq(schema.teamAiActionRuns.id, input.runId)
      )
    );
}

function toAction(row: typeof schema.teamAiActions.$inferSelect): TeamAiAction {
  return {
    id: row.id,
    runId: row.runId,
    teamId: row.teamId,
    actionType: parseTeamAiActionType(row.actionType),
    riskTier: parseTeamAiActionRiskTier(row.riskTier),
    title: row.title,
    description: row.description,
    payload: row.payloadJson ?? null,
    gateDecision: parseTeamAiActionDecision(row.gateDecision),
    status: parseTeamAiActionStatus(row.status),
    blockedReason: row.blockedReason ?? null,
    requiresApproval: toBoolFlag(row.requiresApproval),
    approvedByUserId: row.approvedByUserId ?? null,
    approvedAt: row.approvedAt ?? null,
    executedAt: row.executedAt ?? null,
    failedAt: row.failedAt ?? null,
    rolledBackAt: row.rolledBackAt ?? null,
    rollbackActionId: row.rollbackActionId ?? null,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createTeamAiAction(
  db: DB,
  input: {
    runId: string;
    teamId: string;
    actionType: TeamAiActionType;
    riskTier: TeamAiActionRiskTier;
    title: string;
    description: string;
    payload?: Record<string, unknown> | null;
    gateDecision: TeamAiActionGateDecision;
    status?: TeamAiActionStatus;
    blockedReason?: string | null;
    requiresApproval?: boolean;
    idempotencyKey: string;
  }
): Promise<TeamAiAction> {
  const now = nowIso();
  const action: typeof schema.teamAiActions.$inferInsert = {
    id: randomId("taia"),
    runId: input.runId,
    teamId: input.teamId,
    actionType: input.actionType,
    riskTier: input.riskTier,
    title: input.title,
    description: input.description,
    payloadJson: input.payload ?? null,
    gateDecision: input.gateDecision,
    status: input.status ?? "pending",
    blockedReason: input.blockedReason ?? null,
    requiresApproval: toDbFlag(input.requiresApproval ?? false) ?? 0,
    approvedByUserId: null,
    approvedAt: null,
    executedAt: null,
    failedAt: null,
    rolledBackAt: null,
    rollbackActionId: null,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.teamAiActions).values(action);
  return toAction(action as typeof schema.teamAiActions.$inferSelect);
}

export async function listTeamAiActions(
  db: DB,
  teamId: string,
  options: { runId?: string; limit?: number } = {}
): Promise<TeamAiAction[]> {
  const limit = clampInt(options.limit ?? 50, 1, 200);
  const whereClause = options.runId
    ? and(
        eq(schema.teamAiActions.teamId, teamId),
        eq(schema.teamAiActions.runId, options.runId)
      )
    : eq(schema.teamAiActions.teamId, teamId);

  const rows = await db
    .select()
    .from(schema.teamAiActions)
    .where(whereClause)
    .orderBy(desc(schema.teamAiActions.createdAt))
    .limit(limit);

  return rows.map((row) => toAction(row));
}

export async function getTeamAiAction(
  db: DB,
  teamId: string,
  actionId: string
): Promise<TeamAiAction | null> {
  const rows = await db
    .select()
    .from(schema.teamAiActions)
    .where(
      and(
        eq(schema.teamAiActions.teamId, teamId),
        eq(schema.teamAiActions.id, actionId)
      )
    )
    .limit(1);

  return rows[0] ? toAction(rows[0]) : null;
}

export async function updateTeamAiAction(
  db: DB,
  input: {
    teamId: string;
    actionId: string;
    status?: TeamAiActionStatus;
    blockedReason?: string | null;
    approvedByUserId?: string | null;
    approvedAt?: string | null;
    executedAt?: string | null;
    failedAt?: string | null;
    rolledBackAt?: string | null;
    rollbackActionId?: string | null;
  }
): Promise<void> {
  const patch: Partial<typeof schema.teamAiActions.$inferInsert> = {
    updatedAt: nowIso(),
  };
  if (input.status !== undefined) patch.status = input.status;
  if (input.blockedReason !== undefined) patch.blockedReason = input.blockedReason;
  if (input.approvedByUserId !== undefined) {
    patch.approvedByUserId = input.approvedByUserId;
  }
  if (input.approvedAt !== undefined) patch.approvedAt = input.approvedAt;
  if (input.executedAt !== undefined) patch.executedAt = input.executedAt;
  if (input.failedAt !== undefined) patch.failedAt = input.failedAt;
  if (input.rolledBackAt !== undefined) patch.rolledBackAt = input.rolledBackAt;
  if (input.rollbackActionId !== undefined) {
    patch.rollbackActionId = input.rollbackActionId;
  }

  await db
    .update(schema.teamAiActions)
    .set(patch)
    .where(
      and(
        eq(schema.teamAiActions.teamId, input.teamId),
        eq(schema.teamAiActions.id, input.actionId)
      )
    );
}

function toActionEvent(
  row: typeof schema.teamAiActionEvents.$inferSelect
): TeamAiActionEvent {
  const level =
    row.level === "warning" || row.level === "error" || row.level === "info"
      ? row.level
      : "info";

  return {
    id: row.id,
    runId: row.runId,
    actionId: row.actionId ?? null,
    teamId: row.teamId,
    eventType: row.eventType,
    level,
    message: row.message,
    data: row.dataJson ?? null,
    createdAt: row.createdAt,
  };
}

export async function createTeamAiActionEvent(
  db: DB,
  input: {
    runId: string;
    teamId: string;
    actionId?: string | null;
    eventType: string;
    level?: "info" | "warning" | "error";
    message: string;
    data?: Record<string, unknown> | null;
  }
): Promise<TeamAiActionEvent> {
  const event: typeof schema.teamAiActionEvents.$inferInsert = {
    id: randomId("taie"),
    runId: input.runId,
    actionId: input.actionId ?? null,
    teamId: input.teamId,
    eventType: input.eventType,
    level: input.level ?? "info",
    message: input.message,
    dataJson: input.data ?? null,
    createdAt: nowIso(),
  };
  await db.insert(schema.teamAiActionEvents).values(event);
  return toActionEvent(event as typeof schema.teamAiActionEvents.$inferSelect);
}

export async function listTeamAiActionEvents(
  db: DB,
  teamId: string,
  options: { runId?: string; actionId?: string; limit?: number } = {}
): Promise<TeamAiActionEvent[]> {
  const limit = clampInt(options.limit ?? 100, 1, 500);
  let whereClause = eq(schema.teamAiActionEvents.teamId, teamId);

  if (options.runId) {
    whereClause = and(
      whereClause,
      eq(schema.teamAiActionEvents.runId, options.runId)
    ) as typeof whereClause;
  }

  if (options.actionId) {
    whereClause = and(
      whereClause,
      eq(schema.teamAiActionEvents.actionId, options.actionId)
    ) as typeof whereClause;
  }

  const rows = await db
    .select()
    .from(schema.teamAiActionEvents)
    .where(whereClause)
    .orderBy(desc(schema.teamAiActionEvents.createdAt))
    .limit(limit);

  return rows.map((row) => toActionEvent(row));
}

function toActionAttempt(
  row: typeof schema.teamAiActionAttempts.$inferSelect
): TeamAiActionAttempt {
  return {
    id: row.id,
    actionId: row.actionId,
    attemptNumber: Number(row.attemptNumber) || 1,
    idempotencyKey: row.idempotencyKey,
    executor: row.executor,
    status: row.status,
    request: row.requestJson ?? null,
    response: row.responseJson ?? null,
    error: row.error ?? null,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? null,
    durationMs: row.durationMs ?? null,
  };
}

export async function getTeamAiActionAttemptByIdempotency(
  db: DB,
  idempotencyKey: string
): Promise<TeamAiActionAttempt | null> {
  const rows = await db
    .select()
    .from(schema.teamAiActionAttempts)
    .where(eq(schema.teamAiActionAttempts.idempotencyKey, idempotencyKey))
    .limit(1);
  return rows[0] ? toActionAttempt(rows[0]) : null;
}

export async function createTeamAiActionAttempt(
  db: DB,
  input: {
    actionId: string;
    idempotencyKey: string;
    status: string;
    request?: Record<string, unknown> | null;
  }
): Promise<TeamAiActionAttempt> {
  const now = nowIso();
  const rows = await db
    .select({
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(schema.teamAiActionAttempts)
    .where(eq(schema.teamAiActionAttempts.actionId, input.actionId));
  const attemptNumber = Number(rows[0]?.count ?? 0) + 1;

  const attempt: typeof schema.teamAiActionAttempts.$inferInsert = {
    id: randomId("taat"),
    actionId: input.actionId,
    attemptNumber,
    idempotencyKey: input.idempotencyKey,
    executor: "dynamic_worker",
    status: input.status,
    requestJson: input.request ?? null,
    responseJson: null,
    error: null,
    startedAt: now,
    finishedAt: null,
    durationMs: null,
  };
  await db.insert(schema.teamAiActionAttempts).values(attempt);
  return toActionAttempt(attempt as typeof schema.teamAiActionAttempts.$inferSelect);
}

export async function completeTeamAiActionAttempt(
  db: DB,
  input: {
    attemptId: string;
    status: string;
    response?: Record<string, unknown> | null;
    error?: string | null;
  }
): Promise<void> {
  const finishedAt = nowIso();
  const existing = await db
    .select()
    .from(schema.teamAiActionAttempts)
    .where(eq(schema.teamAiActionAttempts.id, input.attemptId))
    .limit(1);
  const startedAt = existing[0]?.startedAt ? Date.parse(existing[0].startedAt) : null;
  const finishedAtMs = Date.parse(finishedAt);
  const durationMs =
    startedAt && Number.isFinite(startedAt) && Number.isFinite(finishedAtMs)
      ? Math.max(0, finishedAtMs - startedAt)
      : null;

  await db
    .update(schema.teamAiActionAttempts)
    .set({
      status: input.status,
      responseJson: input.response ?? null,
      error: input.error ?? null,
      finishedAt,
      durationMs,
    })
    .where(eq(schema.teamAiActionAttempts.id, input.attemptId));
}

function toGithubRepoMapping(
  row: typeof schema.teamAiGithubRepoMappings.$inferSelect
): TeamAiGithubRepoMapping {
  return {
    id: row.id,
    teamId: row.teamId,
    projectId: row.projectId ?? null,
    installationId: row.installationId ?? null,
    repositoryOwner: row.repositoryOwner,
    repositoryName: row.repositoryName,
    defaultBranch: row.defaultBranch,
    pathAllowlist: toStringArray(row.pathAllowlistJson, []),
    maxFilesChanged: clampInt(
      row.maxFilesChanged ?? 12,
      MIN_MAX_FILES_CHANGED,
      MAX_MAX_FILES_CHANGED
    ),
    maxPatchBytes: clampInt(
      row.maxPatchBytes ?? 50_000,
      MIN_MAX_PATCH_BYTES,
      MAX_MAX_PATCH_BYTES
    ),
    enabled: toBoolFlag(row.enabled),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toGithubInstallation(
  row: typeof schema.teamAiGithubInstallations.$inferSelect
): TeamAiGithubInstallation {
  const repositorySelection = row.repositorySelection;
  return {
    id: row.id,
    teamId: row.teamId,
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    targetType: row.targetType,
    targetId: row.targetId ?? null,
    repositorySelection:
      repositorySelection === "all" || repositorySelection === "selected"
        ? repositorySelection
        : "unknown",
    appSlug: row.appSlug ?? null,
    connectedByUserId: row.connectedByUserId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listTeamAiGithubInstallations(
  db: DB,
  teamId: string
): Promise<TeamAiGithubInstallation[]> {
  const rows = await db
    .select()
    .from(schema.teamAiGithubInstallations)
    .where(eq(schema.teamAiGithubInstallations.teamId, teamId))
    .orderBy(desc(schema.teamAiGithubInstallations.updatedAt));
  return rows.map((row) => toGithubInstallation(row));
}

export async function getTeamAiGithubInstallation(
  db: DB,
  teamId: string,
  installationId: number
): Promise<TeamAiGithubInstallation | null> {
  const rows = await db
    .select()
    .from(schema.teamAiGithubInstallations)
    .where(
      and(
        eq(schema.teamAiGithubInstallations.teamId, teamId),
        eq(schema.teamAiGithubInstallations.installationId, installationId)
      )
    )
    .limit(1);
  return rows[0] ? toGithubInstallation(rows[0]) : null;
}

export async function upsertTeamAiGithubInstallation(
  db: DB,
  input: {
    teamId: string;
    installationId: number;
    accountLogin: string;
    accountType: string;
    targetType: string;
    targetId?: number | null;
    repositorySelection?: "all" | "selected" | "unknown";
    appSlug?: string | null;
    connectedByUserId?: string | null;
  }
): Promise<TeamAiGithubInstallation> {
  const now = nowIso();
  const existing = await db
    .select()
    .from(schema.teamAiGithubInstallations)
    .where(
      and(
        eq(schema.teamAiGithubInstallations.teamId, input.teamId),
        eq(schema.teamAiGithubInstallations.installationId, input.installationId)
      )
    )
    .limit(1);

  if (!existing.length) {
    await db.insert(schema.teamAiGithubInstallations).values({
      id: randomId("taigi"),
      teamId: input.teamId,
      installationId: input.installationId,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      repositorySelection: input.repositorySelection ?? "unknown",
      appSlug: input.appSlug ?? null,
      connectedByUserId: input.connectedByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(schema.teamAiGithubInstallations)
      .set({
        accountLogin: input.accountLogin,
        accountType: input.accountType,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        repositorySelection: input.repositorySelection ?? "unknown",
        appSlug: input.appSlug ?? existing[0].appSlug ?? null,
        connectedByUserId: input.connectedByUserId ?? existing[0].connectedByUserId ?? null,
        updatedAt: now,
      })
      .where(eq(schema.teamAiGithubInstallations.id, existing[0].id));
  }

  const saved = await getTeamAiGithubInstallation(
    db,
    input.teamId,
    input.installationId
  );
  if (!saved) {
    throw new Error("Failed to persist GitHub installation");
  }
  return saved;
}

export async function listTeamAiGithubRepoMappings(
  db: DB,
  teamId: string
): Promise<TeamAiGithubRepoMapping[]> {
  const rows = await db
    .select()
    .from(schema.teamAiGithubRepoMappings)
    .where(eq(schema.teamAiGithubRepoMappings.teamId, teamId))
    .orderBy(desc(schema.teamAiGithubRepoMappings.createdAt));
  return rows.map((row) => toGithubRepoMapping(row));
}

export async function getTeamAiGithubRepoMapping(
  db: DB,
  teamId: string,
  id: string
): Promise<TeamAiGithubRepoMapping | null> {
  const rows = await db
    .select()
    .from(schema.teamAiGithubRepoMappings)
    .where(
      and(
        eq(schema.teamAiGithubRepoMappings.teamId, teamId),
        eq(schema.teamAiGithubRepoMappings.id, id)
      )
    )
    .limit(1);
  return rows[0] ? toGithubRepoMapping(rows[0]) : null;
}

export async function findTeamAiGithubRepoMappingByProject(
  db: DB,
  input: {
    teamId: string;
    projectId?: string | null;
  }
): Promise<TeamAiGithubRepoMapping | null> {
  const whereClause = input.projectId
    ? and(
        eq(schema.teamAiGithubRepoMappings.teamId, input.teamId),
        eq(schema.teamAiGithubRepoMappings.projectId, input.projectId)
      )
    : and(
        eq(schema.teamAiGithubRepoMappings.teamId, input.teamId),
        isNull(schema.teamAiGithubRepoMappings.projectId)
      );
  const rows = await db
    .select()
    .from(schema.teamAiGithubRepoMappings)
    .where(whereClause)
    .limit(1);
  return rows[0] ? toGithubRepoMapping(rows[0]) : null;
}

export async function upsertTeamAiGithubRepoMapping(
  db: DB,
  teamId: string,
  input: TeamAiGithubRepoMappingInput
): Promise<TeamAiGithubRepoMapping> {
  const now = nowIso();
  const projectClause =
    input.projectId === null || input.projectId === undefined
      ? isNull(schema.teamAiGithubRepoMappings.projectId)
      : eq(schema.teamAiGithubRepoMappings.projectId, input.projectId);
  const existing = await db
    .select()
    .from(schema.teamAiGithubRepoMappings)
    .where(
      and(
        eq(schema.teamAiGithubRepoMappings.teamId, teamId),
        projectClause,
        eq(schema.teamAiGithubRepoMappings.repositoryOwner, input.repositoryOwner),
        eq(schema.teamAiGithubRepoMappings.repositoryName, input.repositoryName)
      )
    )
    .limit(1);

  if (!existing.length) {
    const insert: typeof schema.teamAiGithubRepoMappings.$inferInsert = {
      id: randomId("taigm"),
      teamId,
      projectId: input.projectId ?? null,
      installationId: input.installationId,
      repositoryOwner: input.repositoryOwner,
      repositoryName: input.repositoryName,
      defaultBranch: input.defaultBranch?.trim() || "main",
      pathAllowlistJson: input.pathAllowlist ?? [],
      maxFilesChanged: clampInt(
        input.maxFilesChanged ?? 12,
        MIN_MAX_FILES_CHANGED,
        MAX_MAX_FILES_CHANGED
      ),
      maxPatchBytes: clampInt(
        input.maxPatchBytes ?? 50_000,
        MIN_MAX_PATCH_BYTES,
        MAX_MAX_PATCH_BYTES
      ),
      enabled: toDbFlag(input.enabled ?? true) ?? 1,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.teamAiGithubRepoMappings).values(insert);
  } else {
    await db
      .update(schema.teamAiGithubRepoMappings)
      .set({
        installationId: input.installationId,
        defaultBranch: input.defaultBranch?.trim() || existing[0].defaultBranch,
        pathAllowlistJson: input.pathAllowlist ?? existing[0].pathAllowlistJson,
        maxFilesChanged: clampInt(
          input.maxFilesChanged ?? existing[0].maxFilesChanged ?? 12,
          MIN_MAX_FILES_CHANGED,
          MAX_MAX_FILES_CHANGED
        ),
        maxPatchBytes: clampInt(
          input.maxPatchBytes ?? existing[0].maxPatchBytes ?? 50_000,
          MIN_MAX_PATCH_BYTES,
          MAX_MAX_PATCH_BYTES
        ),
        enabled: toDbFlag(input.enabled ?? toBoolFlag(existing[0].enabled)) ?? 1,
        updatedAt: now,
      })
      .where(eq(schema.teamAiGithubRepoMappings.id, existing[0].id));
  }

  const resolved = await findTeamAiGithubRepoMappingByProject(db, {
    teamId,
    projectId: input.projectId ?? null,
  });
  if (!resolved) {
    throw new Error("Failed to persist GitHub mapping");
  }
  return resolved;
}

export async function deleteTeamAiGithubRepoMapping(
  db: DB,
  teamId: string,
  id: string
): Promise<boolean> {
  const result = await db
    .delete(schema.teamAiGithubRepoMappings)
    .where(
      and(
        eq(schema.teamAiGithubRepoMappings.teamId, teamId),
        eq(schema.teamAiGithubRepoMappings.id, id)
      )
    );
  return Number(result.meta?.changes ?? 0) > 0;
}
