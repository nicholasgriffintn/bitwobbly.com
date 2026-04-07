import {
  DEFAULT_ACTION_BLOCKLIST,
  DEFAULT_ACTION_EGRESS_ALLOWLIST,
  DEFAULT_AI_ACTIONS_ENABLED,
  DEFAULT_AI_EXECUTION_MODE,
  DEFAULT_GITHUB_AUTOFIX_ENABLED,
  DEFAULT_LOW_RISK_AUTO_ENABLED,
  DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES,
  DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
  DEFAULT_MAX_CONTEXT_ITEMS,
  TEAM_AI_ASSISTANT_DEFAULT_MODEL,
} from "../src/ai/constants.ts";

export type TeamAiAssistantSettingsRowFixture = {
  teamId: string;
  enabled: number;
  model: string;
  autoAuditEnabled: number;
  autoAuditIntervalMinutes: number;
  manualAuditRateLimitPerHour: number;
  maxContextItems: number;
  includeIssues: number;
  includeMonitors: number;
  includeComponents: number;
  includeStatusPages: number;
  includeNotifications: number;
  includeGroupingRules: number;
  customInstructions: string | null;
  lastAutoAuditAt: number | null;
  createdAt: string;
  updatedAt: string;
};

export function makeTeamAiAssistantSettingsRowFixture(
  overrides: Partial<TeamAiAssistantSettingsRowFixture> = {}
): TeamAiAssistantSettingsRowFixture {
  return {
    teamId: "team_1",
    enabled: 1,
    model: TEAM_AI_ASSISTANT_DEFAULT_MODEL,
    autoAuditEnabled: 1,
    autoAuditIntervalMinutes: DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES,
    manualAuditRateLimitPerHour: DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
    maxContextItems: DEFAULT_MAX_CONTEXT_ITEMS,
    includeIssues: 1,
    includeMonitors: 1,
    includeComponents: 1,
    includeStatusPages: 1,
    includeNotifications: 1,
    includeGroupingRules: 1,
    customInstructions: null,
    lastAutoAuditAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export type TeamAiActionPolicyRowFixture = {
  teamId: string;
  autoActionsEnabled: number;
  executionMode: string;
  lowRiskAutoEnabled: number;
  blockedActionTypesJson: string[] | null;
  egressAllowlistJson: string[] | null;
  githubAutofixEnabled: number;
  createdAt: string;
  updatedAt: string;
};

export function makeTeamAiActionPolicyRowFixture(
  overrides: Partial<TeamAiActionPolicyRowFixture> = {}
): TeamAiActionPolicyRowFixture {
  return {
    teamId: "team_1",
    autoActionsEnabled: DEFAULT_AI_ACTIONS_ENABLED ? 1 : 0,
    executionMode: DEFAULT_AI_EXECUTION_MODE,
    lowRiskAutoEnabled: DEFAULT_LOW_RISK_AUTO_ENABLED ? 1 : 0,
    blockedActionTypesJson: Array.from(DEFAULT_ACTION_BLOCKLIST),
    egressAllowlistJson: Array.from(DEFAULT_ACTION_EGRESS_ALLOWLIST),
    githubAutofixEnabled: DEFAULT_GITHUB_AUTOFIX_ENABLED ? 1 : 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
