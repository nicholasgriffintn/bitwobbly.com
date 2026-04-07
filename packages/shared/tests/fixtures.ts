import {
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
