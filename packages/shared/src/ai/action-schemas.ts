import { z } from "zod";

import {
  DEFAULT_ACTION_BLOCKLIST,
  DEFAULT_ACTION_EGRESS_ALLOWLIST,
  DEFAULT_AI_ACTIONS_ENABLED,
  DEFAULT_AI_EXECUTION_MODE,
  DEFAULT_GITHUB_AUTOFIX_ENABLED,
  DEFAULT_LOW_RISK_AUTO_ENABLED,
} from "./constants.ts";
import { extractAiTextContent } from "./response.ts";
import type {
  AiActionCommandEvent,
  AiActionTriggerEvent,
  AiActionWorkerMessage,
  TeamAiAction,
  TeamAiActionExecutionMode,
  TeamAiActionGateDecision,
  TeamAiActionPlan,
  TeamAiActionPolicy,
  TeamAiActionRiskTier,
  TeamAiActionRunStatus,
  TeamAiActionStatus,
  TeamAiActionType,
  TeamAiGithubRepoMappingInput,
} from "./types.ts";

export const TeamAiActionExecutionModeSchema = z.enum([
  "risk_based",
  "approval_required",
  "auto",
]);

export const TeamAiActionTypeSchema = z.enum([
  "monitor_tuning",
  "notification_routing",
  "sentry_grouping_update",
  "incident_runbook_update",
  "github_autofix",
  "run_sql",
  "shell_command",
]);

export const TeamAiActionRiskTierSchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const TeamAiActionGateDecisionSchema = z.enum([
  "auto",
  "approval_required",
  "blocked",
]);

export const TeamAiActionRunStatusSchema = z.enum([
  "planning",
  "awaiting_approval",
  "executing",
  "completed",
  "failed",
  "blocked",
  "cancelled",
]);

export const TeamAiActionStatusSchema = z.enum([
  "pending",
  "approved",
  "executing",
  "completed",
  "failed",
  "blocked",
  "cancelled",
  "rolled_back",
]);

export const AiActionTriggerEventSchema = z.object({
  id: z.string().min(1).max(120),
  source: z.enum(["assistant_audit", "monitor_transition", "incident", "sentry"]),
  type: z.enum([
    "audit_completed",
    "monitor_down",
    "monitor_recovered",
    "incident_opened",
    "incident_resolved",
    "sentry_issue_created",
    "sentry_issue_regressed",
  ]),
  teamId: z.string().min(1).max(120),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(200),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const AiActionCommandEventSchema = z.object({
  id: z.string().min(1).max(120),
  teamId: z.string().min(1).max(120),
  actionId: z.string().min(1).max(120),
  operation: z.enum(["approve", "reject", "cancel", "retry", "rollback"]),
  requestedByUserId: z.string().min(1).max(120).nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }),
});

export const AiActionWorkerMessageSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("trigger"),
    trigger: AiActionTriggerEventSchema,
  }),
  z.object({
    kind: z.literal("command"),
    command: AiActionCommandEventSchema,
  }),
]);

export const TeamAiActionPlanActionSchema = z.object({
  actionType: TeamAiActionTypeSchema,
  riskTier: TeamAiActionRiskTierSchema,
  title: z.string().min(5).max(240),
  description: z.string().min(5).max(2000),
  rationale: z.string().min(5).max(2000),
  payload: z.record(z.string(), z.unknown()),
  rollback: z
    .object({
      strategy: z.string().min(5).max(400),
      payload: z.record(z.string(), z.unknown()).optional(),
    })
    .nullable()
    .optional(),
});

export const TeamAiActionPlanSchema = z.object({
  summary: z.string().min(8).max(3000),
  actions: z.array(TeamAiActionPlanActionSchema).min(1).max(25),
});

export const TeamAiActionPolicySchema = z.object({
  teamId: z.string().min(1).max(120),
  autoActionsEnabled: z.boolean().default(DEFAULT_AI_ACTIONS_ENABLED),
  executionMode: TeamAiActionExecutionModeSchema.default(DEFAULT_AI_EXECUTION_MODE),
  lowRiskAutoEnabled: z.boolean().default(DEFAULT_LOW_RISK_AUTO_ENABLED),
  blockedActionTypes: z
    .array(TeamAiActionTypeSchema)
    .default(() => [...DEFAULT_ACTION_BLOCKLIST] as TeamAiActionType[]),
  egressAllowlist: z
    .array(z.string().min(1).max(255))
    .default(() => [...DEFAULT_ACTION_EGRESS_ALLOWLIST]),
  githubAutofixEnabled: z.boolean().default(DEFAULT_GITHUB_AUTOFIX_ENABLED),
  createdAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
});

export const TeamAiActionPolicyUpdateSchema = z
  .object({
    autoActionsEnabled: z.boolean().optional(),
    executionMode: TeamAiActionExecutionModeSchema.optional(),
    lowRiskAutoEnabled: z.boolean().optional(),
    blockedActionTypes: z.array(TeamAiActionTypeSchema).optional(),
    egressAllowlist: z.array(z.string().min(1).max(255)).optional(),
    githubAutofixEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one policy field must be updated",
  });

export const TeamAiActionApprovalSchema = z.object({
  actionId: z.string().min(1).max(120),
});

export const TeamAiActionRetrySchema = z.object({
  actionId: z.string().min(1).max(120),
});

export const TeamAiActionRollbackSchema = z.object({
  actionId: z.string().min(1).max(120),
});

export const TeamAiGithubRepoMappingInputSchema = z.object({
  projectId: z.string().min(1).max(120).nullable().optional(),
  repositoryOwner: z.string().min(1).max(120),
  repositoryName: z.string().min(1).max(120),
  defaultBranch: z.string().min(1).max(120).optional(),
  pathAllowlist: z.array(z.string().min(1).max(255)).optional(),
  maxFilesChanged: z.number().int().min(1).max(100).optional(),
  maxPatchBytes: z.number().int().min(1024).max(1_000_000).optional(),
  enabled: z.boolean().optional(),
});

export const TeamAiActionGateEvaluationSchema = z.object({
  actionType: TeamAiActionTypeSchema,
  riskTier: TeamAiActionRiskTierSchema,
  decision: TeamAiActionGateDecisionSchema,
  reason: z.string().nullable(),
});

export function parseAiActionTriggerEvent(value: unknown): AiActionTriggerEvent {
  return AiActionTriggerEventSchema.parse(value);
}

export function parseAiActionCommandEvent(value: unknown): AiActionCommandEvent {
  return AiActionCommandEventSchema.parse(value);
}

export function parseAiActionWorkerMessage(value: unknown): AiActionWorkerMessage {
  return AiActionWorkerMessageSchema.parse(value);
}

function extractLikelyJsonText(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

export function parseStrictTeamAiActionPlan(raw: unknown): TeamAiActionPlan {
  if (typeof raw === "object" && raw !== null) {
    const parsedObject = TeamAiActionPlanSchema.safeParse(raw);
    if (parsedObject.success) return parsedObject.data;
  }

  const text = extractAiTextContent(raw);
  if (!text) {
    throw new Error("Model did not return an action plan payload");
  }

  const jsonText = extractLikelyJsonText(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Model did not return valid JSON");
  }

  return TeamAiActionPlanSchema.parse(parsed);
}

export function parseTeamAiActionType(value: string): TeamAiActionType {
  return TeamAiActionTypeSchema.parse(value);
}

export function parseTeamAiActionRiskTier(value: string): TeamAiActionRiskTier {
  return TeamAiActionRiskTierSchema.parse(value);
}

export function parseTeamAiActionDecision(value: string): TeamAiActionGateDecision {
  return TeamAiActionGateDecisionSchema.parse(value);
}

export function parseTeamAiActionRunStatus(value: string): TeamAiActionRunStatus {
  return TeamAiActionRunStatusSchema.parse(value);
}

export function parseTeamAiActionStatus(value: string): TeamAiActionStatus {
  return TeamAiActionStatusSchema.parse(value);
}

export function parseTeamAiExecutionMode(value: string): TeamAiActionExecutionMode {
  return TeamAiActionExecutionModeSchema.parse(value);
}

export function parseTeamAiPolicy(value: unknown): TeamAiActionPolicy {
  return TeamAiActionPolicySchema.parse(value);
}

export function parseTeamAiPolicyUpdate(value: unknown): {
  autoActionsEnabled?: boolean;
  executionMode?: TeamAiActionExecutionMode;
  lowRiskAutoEnabled?: boolean;
  blockedActionTypes?: TeamAiActionType[];
  egressAllowlist?: string[];
  githubAutofixEnabled?: boolean;
} {
  return TeamAiActionPolicyUpdateSchema.parse(value);
}

export function parseTeamAiGithubRepoMappingInput(
  value: unknown
): TeamAiGithubRepoMappingInput {
  return TeamAiGithubRepoMappingInputSchema.parse(value);
}

export function sanitiseHostnameAllowlist(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    )
  ).sort();
}

export function shouldAllowEgress(url: string, allowlist: string[]): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  const normalisedAllowlist = sanitiseHostnameAllowlist(allowlist);
  return normalisedAllowlist.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
}

export function classifyTeamAiActionGate(input: {
  actionType: TeamAiActionType;
  riskTier: TeamAiActionRiskTier;
  policy: TeamAiActionPolicy;
}): {
  decision: TeamAiActionGateDecision;
  reason: string | null;
} {
  const { actionType, riskTier, policy } = input;

  if (!policy.autoActionsEnabled) {
    return {
      decision: "approval_required",
      reason: "Automatic actions are disabled for this team",
    };
  }

  if (policy.blockedActionTypes.includes(actionType)) {
    return {
      decision: "blocked",
      reason: `Action type '${actionType}' is blocked by team policy`,
    };
  }

  if (actionType === "github_autofix" && !policy.githubAutofixEnabled) {
    return {
      decision: "blocked",
      reason: "GitHub autofix is disabled for this team",
    };
  }

  if (policy.executionMode === "approval_required") {
    return {
      decision: "approval_required",
      reason: "Execution mode requires manual approval",
    };
  }

  if (policy.executionMode === "auto") {
    return { decision: "auto", reason: null };
  }

  if (riskTier === "low") {
    if (policy.lowRiskAutoEnabled) {
      return { decision: "auto", reason: null };
    }
    return {
      decision: "approval_required",
      reason: "Low-risk auto execution is disabled",
    };
  }

  return {
    decision: "approval_required",
    reason: "Risk tier requires manual approval",
  };
}

export function isActionApprovalPending(action: TeamAiAction): boolean {
  return action.requiresApproval && action.status === "pending";
}
