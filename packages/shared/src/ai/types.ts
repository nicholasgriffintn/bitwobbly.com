export type TeamAiAssistantRunType =
  | "manual_query"
  | "manual_audit"
  | "auto_audit";

export type TeamAiAssistantRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type TeamAiActionExecutionMode =
  | "risk_based"
  | "approval_required"
  | "auto";

export type TeamAiActionRiskTier = "low" | "medium" | "high" | "critical";

export type TeamAiActionType =
  | "monitor_tuning"
  | "notification_routing"
  | "sentry_grouping_update"
  | "incident_runbook_update"
  | "github_autofix"
  | "run_sql"
  | "shell_command";

export type TeamAiActionGateDecision = "auto" | "approval_required" | "blocked";

export type TeamAiActionRunStatus =
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export type TeamAiActionStatus =
  | "pending"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled"
  | "rolled_back";

export type TeamAiActionEventLevel = "info" | "warning" | "error";

export type MonitorContextItem = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  status: string;
  intervalSeconds: number;
  failureThreshold: number;
  lastCheckedAt: number;
  latencyMs: number | null;
  lastError: string | null;
  url: string | null;
};

export type ComponentContextItem = {
  id: string;
  name: string;
  status: string;
  updatedAt: number | null;
};

export type IncidentContextItem = {
  id: string;
  title: string;
  status: string;
  startedAt: number;
  resolvedAt: number | null;
  monitorId: string | null;
  statusPageId: string | null;
};

export type SentryIssueContextItem = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  level: string;
  status: string;
  eventCount: number;
  userCount: number;
  lastSeenAt: number;
};

export type StatusPageContextItem = {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  accessMode: string;
  componentCount: number;
};

export type NotificationChannelContextItem = {
  id: string;
  type: string;
  enabled: boolean;
  configKeys: string[];
};

export type AlertRuleContextItem = {
  id: string;
  name: string;
  enabled: boolean;
  sourceType: string;
  triggerType: string;
  projectId: string | null;
  monitorId: string | null;
  channelType: string | null;
  actionIntervalSeconds: number;
};

export type GroupingRuleContextItem = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  enabled: boolean;
  fingerprint: string;
  matchers: Record<string, unknown> | null;
};

export interface TeamAiAssistantSettings {
  teamId: string;
  enabled: boolean;
  model: string;
  autoAuditEnabled: boolean;
  autoAuditIntervalMinutes: number;
  manualAuditRateLimitPerHour: number;
  autoActionsEnabled: boolean;
  executionMode: TeamAiActionExecutionMode;
  lowRiskAutoEnabled: boolean;
  blockedActionTypes: string[];
  egressAllowlist: string[];
  githubAutofixEnabled: boolean;
  maxContextItems: number;
  includeIssues: boolean;
  includeMonitors: boolean;
  includeComponents: boolean;
  includeStatusPages: boolean;
  includeNotifications: boolean;
  includeGroupingRules: boolean;
  customInstructions: string | null;
  lastAutoAuditAt: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TeamAiAssistantSettingsUpdate {
  enabled?: boolean;
  model?: string;
  autoAuditEnabled?: boolean;
  autoAuditIntervalMinutes?: number;
  manualAuditRateLimitPerHour?: number;
  autoActionsEnabled?: boolean;
  executionMode?: TeamAiActionExecutionMode;
  lowRiskAutoEnabled?: boolean;
  blockedActionTypes?: string[];
  egressAllowlist?: string[];
  githubAutofixEnabled?: boolean;
  maxContextItems?: number;
  includeIssues?: boolean;
  includeMonitors?: boolean;
  includeComponents?: boolean;
  includeStatusPages?: boolean;
  includeNotifications?: boolean;
  includeGroupingRules?: boolean;
  customInstructions?: string | null;
  lastAutoAuditAt?: number | null;
}

export interface TeamAiAssistantRun {
  id: string;
  teamId: string;
  runType: TeamAiAssistantRunType;
  status: TeamAiAssistantRunStatus;
  question: string | null;
  answer: string;
  model: string;
  error: string | null;
  cancelledAt: string | null;
  partialAnswer: string | null;
  latencyMs: number | null;
  tokenUsage: Record<string, unknown> | null;
  previousRunId: string | null;
  diffSummary: Record<string, unknown> | null;
  contextSummary: Record<string, unknown> | null;
  createdAt: string;
}

export interface AiActionTriggerEvent {
  id: string;
  source: "assistant_audit" | "monitor_transition" | "incident" | "sentry";
  type:
    | "audit_completed"
    | "monitor_down"
    | "monitor_recovered"
    | "incident_opened"
    | "incident_resolved"
    | "sentry_issue_created"
    | "sentry_issue_regressed";
  teamId: string;
  occurredAt: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown> | null;
}

export interface AiActionCommandEvent {
  id: string;
  teamId: string;
  actionId: string;
  operation: "approve" | "reject" | "cancel" | "retry" | "rollback";
  requestedByUserId?: string | null;
  occurredAt: string;
}

export type AiActionWorkerMessage =
  | {
      kind: "trigger";
      trigger: AiActionTriggerEvent;
    }
  | {
      kind: "command";
      command: AiActionCommandEvent;
    };

export interface TeamAiActionPlanAction {
  actionType: TeamAiActionType;
  riskTier: TeamAiActionRiskTier;
  title: string;
  description: string;
  rationale: string;
  payload: Record<string, unknown>;
  rollback?: {
    strategy: string;
    payload?: Record<string, unknown>;
  } | null;
}

export interface TeamAiActionPlan {
  summary: string;
  actions: TeamAiActionPlanAction[];
}

export interface TeamAiActionPolicy {
  teamId: string;
  autoActionsEnabled: boolean;
  executionMode: TeamAiActionExecutionMode;
  lowRiskAutoEnabled: boolean;
  blockedActionTypes: string[];
  egressAllowlist: string[];
  githubAutofixEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TeamAiActionPolicyUpdate {
  autoActionsEnabled?: boolean;
  executionMode?: TeamAiActionExecutionMode;
  lowRiskAutoEnabled?: boolean;
  blockedActionTypes?: string[];
  egressAllowlist?: string[];
  githubAutofixEnabled?: boolean;
}

export interface TeamAiActionRun {
  id: string;
  teamId: string;
  triggerSource: AiActionTriggerEvent["source"];
  triggerType: AiActionTriggerEvent["type"];
  triggerId: string;
  status: TeamAiActionRunStatus;
  snapshot: Record<string, unknown> | null;
  plan: TeamAiActionPlan | null;
  policy: TeamAiActionPolicy | null;
  blockedReason: string | null;
  error: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamAiAction {
  id: string;
  runId: string;
  teamId: string;
  actionType: TeamAiActionType;
  riskTier: TeamAiActionRiskTier;
  title: string;
  description: string;
  payload: Record<string, unknown> | null;
  gateDecision: TeamAiActionGateDecision;
  status: TeamAiActionStatus;
  blockedReason: string | null;
  requiresApproval: boolean;
  approvedByUserId: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  failedAt: string | null;
  rolledBackAt: string | null;
  rollbackActionId: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamAiActionEvent {
  id: string;
  runId: string;
  actionId: string | null;
  teamId: string;
  eventType: string;
  level: TeamAiActionEventLevel;
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface TeamAiActionAttempt {
  id: string;
  actionId: string;
  attemptNumber: number;
  idempotencyKey: string;
  executor: string;
  status: string;
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface TeamAiGithubRepoMapping {
  id: string;
  teamId: string;
  projectId: string | null;
  installationId: number | null;
  repositoryOwner: string;
  repositoryName: string;
  defaultBranch: string;
  pathAllowlist: string[];
  maxFilesChanged: number;
  maxPatchBytes: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamAiGithubRepoMappingInput {
  projectId?: string | null;
  installationId: number;
  repositoryOwner: string;
  repositoryName: string;
  defaultBranch?: string;
  pathAllowlist?: string[];
  maxFilesChanged?: number;
  maxPatchBytes?: number;
  enabled?: boolean;
}

export interface TeamAiGithubInstallation {
  id: string;
  teamId: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  targetType: string;
  targetId: number | null;
  repositorySelection: "all" | "selected" | "unknown";
  appSlug: string | null;
  connectedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamAiAssistantContextSnapshot {
  capturedAt: number;
  team: {
    id: string;
    name: string;
  };
  monitors?: {
    summary: {
      total: number;
      enabled: number;
      up: number;
      down: number;
      unknown: number;
    };
    items: MonitorContextItem[];
  };
  components?: {
    summary: Record<string, number>;
    items: ComponentContextItem[];
  };
  incidents?: {
    open: IncidentContextItem[];
    sentryIssues: SentryIssueContextItem[];
  };
  statusPages?: {
    total: number;
    items: StatusPageContextItem[];
  };
  notifications?: {
    channels: NotificationChannelContextItem[];
    alertRules: AlertRuleContextItem[];
    summary: {
      channelsTotal: number;
      channelsEnabled: number;
      alertRulesTotal: number;
      alertRulesEnabled: number;
      monitorRules: number;
      issueRules: number;
    };
  };
  groupingRules?: {
    total: number;
    enabled: number;
    projectCounts: Array<{ projectId: string; projectName: string; rules: number }>;
    items: GroupingRuleContextItem[];
  };
}

export interface TeamAiAssistantPromptInput {
  mode: "query" | "audit";
  question?: string;
  customInstructions?: string | null;
  snapshot: TeamAiAssistantContextSnapshot;
}

export interface TeamAiActionPlannerPromptInput {
  trigger: AiActionTriggerEvent;
  snapshot: TeamAiAssistantContextSnapshot;
  policy: TeamAiActionPolicy;
  customInstructions?: string | null;
}

export interface TeamAiAutoAuditCandidate {
  teamId: string;
  settings: TeamAiAssistantSettings;
}
