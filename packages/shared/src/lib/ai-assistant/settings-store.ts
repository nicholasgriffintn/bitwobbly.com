import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import type { DB } from "../../db/index.ts";
import { schema } from "../../db/index.ts";
import { clampInt, nowIso, randomId } from "../utils.ts";
import {
  DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES,
  DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
  DEFAULT_MAX_CONTEXT_ITEMS,
  MAX_AUTO_AUDIT_INTERVAL_MINUTES,
  MAX_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
  MAX_MAX_CONTEXT_ITEMS,
  MIN_AUTO_AUDIT_INTERVAL_MINUTES,
  MIN_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
  MIN_MAX_CONTEXT_ITEMS,
  TEAM_AI_ASSISTANT_DEFAULT_MODEL,
} from "./constants.ts";
import type {
  TeamAiAssistantRun,
  TeamAiAssistantRunStatus,
  TeamAiAssistantRunType,
  TeamAiAssistantSettings,
  TeamAiAssistantSettingsUpdate,
  TeamAiAutoAuditCandidate,
} from "./types.ts";

function toRunType(value: string): TeamAiAssistantRunType {
  if (value === "manual_query") return value;
  if (value === "manual_audit") return value;
  if (value === "auto_audit") return value;
  throw new Error(`Invalid AI run type: ${value}`);
}

function toRunStatus(value: string): TeamAiAssistantRunStatus {
  if (value === "running") return value;
  if (value === "completed") return value;
  if (value === "failed") return value;
  if (value === "cancelled") return value;
  throw new Error(`Invalid AI run status: ${value}`);
}

function toBoolFlag(value: number | null | undefined): boolean {
  return Number(value ?? 0) === 1;
}

function toDbFlag(value: boolean | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value ? 1 : 0;
}

function toModelName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : TEAM_AI_ASSISTANT_DEFAULT_MODEL;
}

export function buildDefaultTeamAiAssistantSettings(
  teamId: string
): TeamAiAssistantSettings {
  return {
    teamId,
    enabled: false,
    model: TEAM_AI_ASSISTANT_DEFAULT_MODEL,
    autoAuditEnabled: false,
    autoAuditIntervalMinutes: DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES,
    manualAuditRateLimitPerHour: DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
    maxContextItems: DEFAULT_MAX_CONTEXT_ITEMS,
    includeIssues: true,
    includeMonitors: true,
    includeComponents: true,
    includeStatusPages: true,
    includeNotifications: true,
    includeGroupingRules: true,
    customInstructions: null,
    lastAutoAuditAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

function toSettings(
  row:
    | (typeof schema.teamAiAssistantSettings.$inferSelect & {
        teamId: string;
      })
    | null
    | undefined,
  teamId: string
): TeamAiAssistantSettings {
  if (!row) return buildDefaultTeamAiAssistantSettings(teamId);
  return {
    teamId: row.teamId,
    enabled: toBoolFlag(row.enabled),
    model: row.model || TEAM_AI_ASSISTANT_DEFAULT_MODEL,
    autoAuditEnabled: toBoolFlag(row.autoAuditEnabled),
    autoAuditIntervalMinutes: clampInt(
      row.autoAuditIntervalMinutes ?? DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES,
      MIN_AUTO_AUDIT_INTERVAL_MINUTES,
      MAX_AUTO_AUDIT_INTERVAL_MINUTES
    ),
    manualAuditRateLimitPerHour: clampInt(
      row.manualAuditRateLimitPerHour ?? DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
      MIN_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
      MAX_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR
    ),
    maxContextItems: clampInt(
      row.maxContextItems ?? DEFAULT_MAX_CONTEXT_ITEMS,
      MIN_MAX_CONTEXT_ITEMS,
      MAX_MAX_CONTEXT_ITEMS
    ),
    includeIssues: toBoolFlag(row.includeIssues),
    includeMonitors: toBoolFlag(row.includeMonitors),
    includeComponents: toBoolFlag(row.includeComponents),
    includeStatusPages: toBoolFlag(row.includeStatusPages),
    includeNotifications: toBoolFlag(row.includeNotifications),
    includeGroupingRules: toBoolFlag(row.includeGroupingRules),
    customInstructions: row.customInstructions || null,
    lastAutoAuditAt: row.lastAutoAuditAt ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

function toSettingsInsert(
  teamId: string,
  input: TeamAiAssistantSettingsUpdate,
  now: string
): typeof schema.teamAiAssistantSettings.$inferInsert {
  return {
    teamId,
    enabled: toDbFlag(input.enabled) ?? 0,
    model: toModelName(input.model) ?? TEAM_AI_ASSISTANT_DEFAULT_MODEL,
    autoAuditEnabled: toDbFlag(input.autoAuditEnabled) ?? 0,
    autoAuditIntervalMinutes:
      input.autoAuditIntervalMinutes !== undefined
        ? clampInt(
            input.autoAuditIntervalMinutes,
            MIN_AUTO_AUDIT_INTERVAL_MINUTES,
            MAX_AUTO_AUDIT_INTERVAL_MINUTES
          )
        : DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES,
    manualAuditRateLimitPerHour:
      input.manualAuditRateLimitPerHour !== undefined
        ? clampInt(
            input.manualAuditRateLimitPerHour,
            MIN_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
            MAX_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR
          )
        : DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
    maxContextItems:
      input.maxContextItems !== undefined
        ? clampInt(
            input.maxContextItems,
            MIN_MAX_CONTEXT_ITEMS,
            MAX_MAX_CONTEXT_ITEMS
          )
        : DEFAULT_MAX_CONTEXT_ITEMS,
    includeIssues: toDbFlag(input.includeIssues) ?? 1,
    includeMonitors: toDbFlag(input.includeMonitors) ?? 1,
    includeComponents: toDbFlag(input.includeComponents) ?? 1,
    includeStatusPages: toDbFlag(input.includeStatusPages) ?? 1,
    includeNotifications: toDbFlag(input.includeNotifications) ?? 1,
    includeGroupingRules: toDbFlag(input.includeGroupingRules) ?? 1,
    customInstructions: input.customInstructions ?? null,
    lastAutoAuditAt: input.lastAutoAuditAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function toSettingsUpdate(
  input: TeamAiAssistantSettingsUpdate,
  now: string
): Partial<typeof schema.teamAiAssistantSettings.$inferInsert> {
  const updates: Partial<typeof schema.teamAiAssistantSettings.$inferInsert> = {
    updatedAt: now,
  };

  const maybeModel = toModelName(input.model);
  if (input.enabled !== undefined) updates.enabled = toDbFlag(input.enabled);
  if (maybeModel !== undefined) updates.model = maybeModel;
  if (input.autoAuditEnabled !== undefined) {
    updates.autoAuditEnabled = toDbFlag(input.autoAuditEnabled);
  }
  if (input.autoAuditIntervalMinutes !== undefined) {
    updates.autoAuditIntervalMinutes = clampInt(
      input.autoAuditIntervalMinutes,
      MIN_AUTO_AUDIT_INTERVAL_MINUTES,
      MAX_AUTO_AUDIT_INTERVAL_MINUTES
    );
  }
  if (input.manualAuditRateLimitPerHour !== undefined) {
    updates.manualAuditRateLimitPerHour = clampInt(
      input.manualAuditRateLimitPerHour,
      MIN_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
      MAX_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR
    );
  }
  if (input.maxContextItems !== undefined) {
    updates.maxContextItems = clampInt(
      input.maxContextItems,
      MIN_MAX_CONTEXT_ITEMS,
      MAX_MAX_CONTEXT_ITEMS
    );
  }
  if (input.includeIssues !== undefined) {
    updates.includeIssues = toDbFlag(input.includeIssues);
  }
  if (input.includeMonitors !== undefined) {
    updates.includeMonitors = toDbFlag(input.includeMonitors);
  }
  if (input.includeComponents !== undefined) {
    updates.includeComponents = toDbFlag(input.includeComponents);
  }
  if (input.includeStatusPages !== undefined) {
    updates.includeStatusPages = toDbFlag(input.includeStatusPages);
  }
  if (input.includeNotifications !== undefined) {
    updates.includeNotifications = toDbFlag(input.includeNotifications);
  }
  if (input.includeGroupingRules !== undefined) {
    updates.includeGroupingRules = toDbFlag(input.includeGroupingRules);
  }
  if (input.customInstructions !== undefined) {
    updates.customInstructions = input.customInstructions;
  }
  if (input.lastAutoAuditAt !== undefined) {
    updates.lastAutoAuditAt = input.lastAutoAuditAt;
  }

  return updates;
}

export async function getTeamAiAssistantSettings(
  db: DB,
  teamId: string
): Promise<TeamAiAssistantSettings> {
  const row = await db
    .select()
    .from(schema.teamAiAssistantSettings)
    .where(eq(schema.teamAiAssistantSettings.teamId, teamId))
    .limit(1);

  return toSettings(row[0], teamId);
}

export async function upsertTeamAiAssistantSettings(
  db: DB,
  teamId: string,
  input: TeamAiAssistantSettingsUpdate
): Promise<TeamAiAssistantSettings> {
  const existing = await db
    .select()
    .from(schema.teamAiAssistantSettings)
    .where(eq(schema.teamAiAssistantSettings.teamId, teamId))
    .limit(1);
  const now = nowIso();

  if (!existing.length) {
    await db
      .insert(schema.teamAiAssistantSettings)
      .values(toSettingsInsert(teamId, input, now));
  } else {
    await db
      .update(schema.teamAiAssistantSettings)
      .set(toSettingsUpdate(input, now))
      .where(eq(schema.teamAiAssistantSettings.teamId, teamId));
  }

  return getTeamAiAssistantSettings(db, teamId);
}

export async function listTeamAiAssistantRuns(
  db: DB,
  teamId: string,
  options: {
    limit?: number;
    runTypes?: TeamAiAssistantRunType[];
  } = {}
): Promise<TeamAiAssistantRun[]> {
  const limit = clampInt(options.limit ?? 10, 1, 100);
  const whereClause =
    options.runTypes && options.runTypes.length
      ? and(
          eq(schema.teamAiAssistantRuns.teamId, teamId),
          inArray(schema.teamAiAssistantRuns.runType, options.runTypes)
        )
      : eq(schema.teamAiAssistantRuns.teamId, teamId);

  const rows = await db
    .select()
    .from(schema.teamAiAssistantRuns)
    .where(whereClause)
    .orderBy(desc(schema.teamAiAssistantRuns.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    teamId: row.teamId,
    runType: toRunType(row.runType),
    status: toRunStatus(row.status),
    question: row.question ?? null,
    answer: row.answer,
    model: row.model,
    error: row.error ?? null,
    cancelledAt: row.cancelledAt ?? null,
    partialAnswer: row.partialAnswer ?? null,
    latencyMs: row.latencyMs ?? null,
    tokenUsage: row.tokenUsageJson ?? null,
    previousRunId: row.previousRunId ?? null,
    diffSummary: row.diffSummaryJson ?? null,
    contextSummary: row.contextSummary ?? null,
    createdAt: row.createdAt,
  }));
}

export async function createTeamAiAssistantRun(
  db: DB,
  input: {
    teamId: string;
    runType: TeamAiAssistantRunType;
    status?: TeamAiAssistantRunStatus;
    question?: string | null;
    answer: string;
    model: string;
    error?: string | null;
    cancelledAt?: string | null;
    partialAnswer?: string | null;
    latencyMs?: number | null;
    tokenUsage?: Record<string, unknown> | null;
    previousRunId?: string | null;
    diffSummary?: Record<string, unknown> | null;
    contextSummary?: Record<string, unknown> | null;
  }
): Promise<TeamAiAssistantRun> {
  const now = nowIso();
  const status: TeamAiAssistantRunStatus = input.status ?? "completed";
  const run: typeof schema.teamAiAssistantRuns.$inferInsert = {
    id: randomId("tai"),
    teamId: input.teamId,
    runType: input.runType,
    status,
    question: input.question ?? null,
    answer: input.answer,
    model: input.model,
    error: input.error ?? null,
    cancelledAt: input.cancelledAt ?? null,
    partialAnswer: input.partialAnswer ?? null,
    latencyMs: input.latencyMs ?? null,
    tokenUsageJson: input.tokenUsage ?? null,
    previousRunId: input.previousRunId ?? null,
    diffSummaryJson: input.diffSummary ?? null,
    contextSummary: input.contextSummary ?? null,
    createdAt: now,
  };

  await db.insert(schema.teamAiAssistantRuns).values(run);

  return {
    id: run.id,
    teamId: run.teamId,
    runType: toRunType(run.runType),
    status,
    question: run.question ?? null,
    answer: run.answer,
    model: run.model,
    error: run.error ?? null,
    cancelledAt: run.cancelledAt ?? null,
    partialAnswer: run.partialAnswer ?? null,
    latencyMs: run.latencyMs ?? null,
    tokenUsage: run.tokenUsageJson ?? null,
    previousRunId: run.previousRunId ?? null,
    diffSummary: run.diffSummaryJson ?? null,
    contextSummary: run.contextSummary ?? null,
    createdAt: run.createdAt,
  };
}

export async function countTeamAiAssistantRunsSince(
  db: DB,
  input: {
    teamId: string;
    runType: TeamAiAssistantRunType;
    createdAfterIso: string;
  }
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(schema.teamAiAssistantRuns)
    .where(
      and(
        eq(schema.teamAiAssistantRuns.teamId, input.teamId),
        eq(schema.teamAiAssistantRuns.runType, input.runType),
        gte(schema.teamAiAssistantRuns.createdAt, input.createdAfterIso)
      )
    );

  return Number(rows[0]?.count ?? 0);
}

export async function listTeamsDueForAutoAudit(
  db: DB,
  nowSec: number,
  limit: number
): Promise<TeamAiAutoAuditCandidate[]> {
  const candidates = await db
    .select()
    .from(schema.teamAiAssistantSettings)
    .where(
      and(
        eq(schema.teamAiAssistantSettings.enabled, 1),
        eq(schema.teamAiAssistantSettings.autoAuditEnabled, 1)
      )
    );

  const due = candidates
    .map((row) => toSettings(row, row.teamId))
    .filter((settings) => {
      const intervalSec =
        clampInt(
          settings.autoAuditIntervalMinutes,
          MIN_AUTO_AUDIT_INTERVAL_MINUTES,
          MAX_AUTO_AUDIT_INTERVAL_MINUTES
        ) * 60;
      const last = settings.lastAutoAuditAt ?? 0;
      return last + intervalSec <= nowSec;
    })
    .sort((a, b) => (a.lastAutoAuditAt ?? 0) - (b.lastAutoAuditAt ?? 0))
    .slice(0, clampInt(limit, 1, 100));

  return due.map((settings) => ({
    teamId: settings.teamId,
    settings,
  }));
}

export async function markTeamAiAssistantAutoAudit(
  db: DB,
  teamId: string,
  executedAtSec: number
): Promise<void> {
  await upsertTeamAiAssistantSettings(db, teamId, {
    lastAutoAuditAt: executedAtSec,
  });
}

export async function claimTeamAiAssistantAutoAudit(
  db: DB,
  teamId: string,
  nowSec: number,
  dueBeforeSec: number
): Promise<boolean> {
  const result = await db
    .update(schema.teamAiAssistantSettings)
    .set({
      lastAutoAuditAt: nowSec,
      updatedAt: nowIso(),
    })
    .where(
      and(
        eq(schema.teamAiAssistantSettings.teamId, teamId),
        eq(schema.teamAiAssistantSettings.enabled, 1),
        eq(schema.teamAiAssistantSettings.autoAuditEnabled, 1),
        or(
          isNull(schema.teamAiAssistantSettings.lastAutoAuditAt),
          lte(schema.teamAiAssistantSettings.lastAutoAuditAt, dueBeforeSec)
        )
      )
    );

  return Number(result.meta?.changes ?? 0) > 0;
}
