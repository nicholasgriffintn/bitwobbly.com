export type TeamAiAssistantRunType =
  | "manual_query"
  | "manual_audit"
  | "auto_audit";

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
  question: string | null;
  answer: string;
  model: string;
  contextSummary: Record<string, unknown> | null;
  createdAt: string;
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

export interface TeamAiAutoAuditCandidate {
  teamId: string;
  settings: TeamAiAssistantSettings;
}
