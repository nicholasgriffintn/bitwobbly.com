import {
  text,
  integer,
  sqliteTable,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const teamAiAssistantSettings = sqliteTable("team_ai_assistant_settings", {
  teamId: text("team_id")
    .primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  enabled: integer("enabled").notNull().default(0),
  model: text("model").notNull().default("@cf/moonshotai/kimi-k2.5"),
  autoAuditEnabled: integer("auto_audit_enabled").notNull().default(0),
  autoAuditIntervalMinutes: integer("auto_audit_interval_minutes")
    .notNull()
    .default(1440),
  manualAuditRateLimitPerHour: integer("manual_audit_rate_limit_per_hour")
    .notNull()
    .default(6),
  maxContextItems: integer("max_context_items").notNull().default(30),
  includeIssues: integer("include_issues").notNull().default(1),
  includeMonitors: integer("include_monitors").notNull().default(1),
  includeComponents: integer("include_components").notNull().default(1),
  includeStatusPages: integer("include_status_pages").notNull().default(1),
  includeNotifications: integer("include_notifications").notNull().default(1),
  includeGroupingRules: integer("include_grouping_rules").notNull().default(1),
  customInstructions: text("custom_instructions"),
  lastAutoAuditAt: integer("last_auto_audit_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const teamAiAssistantRuns = sqliteTable(
  "team_ai_assistant_runs",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    runType: text("run_type").notNull(), // "manual_query" | "manual_audit" | "auto_audit"
    status: text("status").notNull().default("completed"),
    question: text("question"),
    answer: text("answer").notNull(),
    model: text("model").notNull(),
    error: text("error"),
    cancelledAt: text("cancelled_at"),
    partialAnswer: text("partial_answer"),
    latencyMs: integer("latency_ms"),
    tokenUsageJson: text("token_usage_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    previousRunId: text("previous_run_id"),
    diffSummaryJson: text("diff_summary_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    contextSummary: text("context_summary", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    teamCreatedIdx: index("team_ai_assistant_runs_team_created_idx").on(
      table.teamId,
      table.createdAt
    ),
    teamRunTypeCreatedIdx: index(
      "team_ai_assistant_runs_team_run_type_created_idx"
    ).on(table.teamId, table.runType, table.createdAt),
  })
);

export const teamAiActionPolicies = sqliteTable("team_ai_action_policies", {
  teamId: text("team_id")
    .primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  autoActionsEnabled: integer("auto_actions_enabled").notNull().default(1),
  executionMode: text("execution_mode").notNull().default("risk_based"), // "risk_based" | "approval_required" | "auto"
  lowRiskAutoEnabled: integer("low_risk_auto_enabled").notNull().default(1),
  blockedActionTypesJson: text("blocked_action_types_json", { mode: "json" }).$type<
    string[] | null
  >(),
  egressAllowlistJson: text("egress_allowlist_json", { mode: "json" }).$type<
    string[] | null
  >(),
  githubAutofixEnabled: integer("github_autofix_enabled").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const teamAiActionRuns = sqliteTable(
  "team_ai_action_runs",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    triggerSource: text("trigger_source").notNull(),
    triggerType: text("trigger_type").notNull(),
    triggerId: text("trigger_id").notNull(),
    status: text("status").notNull().default("planning"),
    snapshotJson: text("snapshot_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    planJson: text("plan_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    policyJson: text("policy_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    blockedReason: text("blocked_reason"),
    error: text("error"),
    cancelledAt: text("cancelled_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    teamCreatedIdx: index("team_ai_action_runs_team_created_idx").on(
      table.teamId,
      table.createdAt
    ),
    teamStatusCreatedIdx: index("team_ai_action_runs_team_status_created_idx").on(
      table.teamId,
      table.status,
      table.createdAt
    ),
    triggerUnique: uniqueIndex("team_ai_action_runs_trigger_unique").on(
      table.teamId,
      table.triggerSource,
      table.triggerType,
      table.triggerId
    ),
  })
);

export const teamAiActions = sqliteTable(
  "team_ai_actions",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => teamAiActionRuns.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    riskTier: text("risk_tier").notNull(), // "low" | "medium" | "high" | "critical"
    title: text("title").notNull(),
    description: text("description").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    gateDecision: text("gate_decision").notNull(), // "auto" | "approval_required" | "blocked"
    status: text("status").notNull().default("pending"),
    blockedReason: text("blocked_reason"),
    requiresApproval: integer("requires_approval").notNull().default(0),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: text("approved_at"),
    executedAt: text("executed_at"),
    failedAt: text("failed_at"),
    rolledBackAt: text("rolled_back_at"),
    rollbackActionId: text("rollback_action_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    runCreatedIdx: index("team_ai_actions_run_created_idx").on(
      table.runId,
      table.createdAt
    ),
    teamStatusCreatedIdx: index("team_ai_actions_team_status_created_idx").on(
      table.teamId,
      table.status,
      table.createdAt
    ),
    idempotencyUnique: uniqueIndex("team_ai_actions_idempotency_unique").on(
      table.idempotencyKey
    ),
  })
);

export const teamAiActionEvents = sqliteTable(
  "team_ai_action_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => teamAiActionRuns.id, { onDelete: "cascade" }),
    actionId: text("action_id").references(() => teamAiActions.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    dataJson: text("data_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    runCreatedIdx: index("team_ai_action_events_run_created_idx").on(
      table.runId,
      table.createdAt
    ),
    actionCreatedIdx: index("team_ai_action_events_action_created_idx").on(
      table.actionId,
      table.createdAt
    ),
    teamCreatedIdx: index("team_ai_action_events_team_created_idx").on(
      table.teamId,
      table.createdAt
    ),
  })
);

export const teamAiActionAttempts = sqliteTable(
  "team_ai_action_attempts",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => teamAiActions.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    executor: text("executor").notNull().default("dynamic_worker"),
    status: text("status").notNull(),
    requestJson: text("request_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    responseJson: text("response_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    error: text("error"),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    durationMs: integer("duration_ms"),
  },
  (table) => ({
    actionAttemptUnique: uniqueIndex("team_ai_action_attempts_action_attempt_unique").on(
      table.actionId,
      table.attemptNumber
    ),
    idempotencyUnique: uniqueIndex("team_ai_action_attempts_idempotency_unique").on(
      table.idempotencyKey
    ),
  })
);

export const teamAiGithubRepoMappings = sqliteTable(
  "team_ai_github_repo_mappings",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    repositoryOwner: text("repository_owner").notNull(),
    repositoryName: text("repository_name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    pathAllowlistJson: text("path_allowlist_json", { mode: "json" }).$type<
      string[] | null
    >(),
    maxFilesChanged: integer("max_files_changed").notNull().default(12),
    maxPatchBytes: integer("max_patch_bytes").notNull().default(50_000),
    enabled: integer("enabled").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    teamProjectRepoUnique: uniqueIndex("team_ai_github_repo_mapping_unique").on(
      table.teamId,
      table.projectId,
      table.repositoryOwner,
      table.repositoryName
    ),
    teamProjectIdx: index("team_ai_github_repo_mapping_team_project_idx").on(
      table.teamId,
      table.projectId
    ),
  })
);

export const monitors = sqliteTable(
  "monitors",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    groupId: text("group_id").references(() => monitorGroups.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    url: text("url"),
    method: text("method").notNull().default("GET"),
    timeoutMs: integer("timeout_ms").notNull().default(8000),
    intervalSeconds: integer("interval_seconds").notNull().default(60),
    failureThreshold: integer("failure_threshold").notNull().default(3),
    enabled: integer("enabled").notNull().default(1),
    nextRunAt: integer("next_run_at").notNull().default(0),
    lockedUntil: integer("locked_until").notNull().default(0),
    type: text("type").notNull().default("http"),
    webhookToken: text("webhook_token"),
    externalConfig: text("external_config"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    schedulingIdx: index("monitors_scheduling_idx").on(
      table.enabled,
      table.nextRunAt,
      table.lockedUntil
    ),
  })
);

export const monitorGroups = sqliteTable("monitor_groups", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

export const monitorState = sqliteTable("monitor_state", {
  monitorId: text("monitor_id")
    .primaryKey()
    .references(() => monitors.id),
  lastCheckedAt: integer("last_checked_at").notNull().default(0),
  lastStatus: text("last_status").notNull().default("unknown"),
  lastLatencyMs: integer("last_latency_ms"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastError: text("last_error"),
  incidentOpen: integer("incident_open").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const statusPages = sqliteTable(
  "status_pages",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    isPublic: integer("is_public").notNull().default(1),
    accessMode: text("access_mode").notNull().default("public"),
    passwordHash: text("password_hash"),
    logoUrl: text("logo_url"),
    brandColor: text("brand_color").default("#007bff"),
    customCss: text("custom_css"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    teamSlugUnique: uniqueIndex("status_pages_team_slug_unique").on(
      table.teamId,
      table.slug
    ),
  })
);

export const components = sqliteTable("components", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  name: text("name").notNull(),
  description: text("description"),
  currentStatus: text("current_status").notNull().default("operational"),
  statusUpdatedAt: integer("status_updated_at"),
  createdAt: text("created_at").notNull(),
});

export const statusPageComponents = sqliteTable(
  "status_page_components",
  {
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id),
    componentId: text("component_id")
      .notNull()
      .references(() => components.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.statusPageId, table.componentId] }),
  })
);

export const componentMonitors = sqliteTable(
  "component_monitors",
  {
    componentId: text("component_id")
      .notNull()
      .references(() => components.id),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.componentId, table.monitorId] }),
  })
);

export const componentDependencies = sqliteTable(
  "component_dependencies",
  {
    componentId: text("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "cascade" }),
    dependsOnComponentId: text("depends_on_component_id")
      .notNull()
      .references(() => components.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.componentId, table.dependsOnComponentId],
    }),
  })
);

export const suppressions = sqliteTable("suppressions", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  kind: text("kind").notNull(), // "maintenance" | "silence"
  name: text("name").notNull(),
  reason: text("reason"),
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at"),
  createdAt: text("created_at").notNull(),
});

export const suppressionScopes = sqliteTable(
  "suppression_scopes",
  {
    suppressionId: text("suppression_id")
      .notNull()
      .references(() => suppressions.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(), // "monitor" | "monitor_group" | "component"
    scopeId: text("scope_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.suppressionId, table.scopeType, table.scopeId],
    }),
  })
);

export const incidents = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    statusPageId: text("status_page_id").references(() => statusPages.id),
    monitorId: text("monitor_id").references(() => monitors.id),
    title: text("title").notNull(),
    status: text("status").notNull(),
    startedAt: integer("started_at").notNull(),
    resolvedAt: integer("resolved_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    teamPageStatusIdx: index("incidents_team_page_status_idx").on(
      table.teamId,
      table.statusPageId,
      table.status
    ),
  })
);

export const incidentUpdates = sqliteTable("incident_updates", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id")
    .notNull()
    .references(() => incidents.id),
  message: text("message").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const incidentComponents = sqliteTable(
  "incident_components",
  {
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id),
    componentId: text("component_id")
      .notNull()
      .references(() => components.id),
    impactLevel: text("impact_level").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.incidentId, table.componentId] }),
  })
);

export const statusPageSubscribers = sqliteTable(
  "status_page_subscribers",
  {
    id: text("id").primaryKey(),
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    channelType: text("channel_type").notNull(), // "email" | "webhook"
    endpoint: text("endpoint").notNull(), // email address or webhook URL
    digestCadence: text("digest_cadence").notNull().default("immediate"), // "immediate" | "daily" | "weekly"
    status: text("status").notNull().default("pending"), // "pending" | "active" | "unsubscribed"
    confirmTokenHash: text("confirm_token_hash"),
    confirmExpiresAt: integer("confirm_expires_at"),
    confirmedAt: text("confirmed_at"),
    unsubscribedAt: text("unsubscribed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    statusPageSubscriberUnique: uniqueIndex(
      "status_page_subscribers_status_page_channel_endpoint_unique"
    ).on(table.statusPageId, table.channelType, table.endpoint),
  })
);

export const statusPageSubscriberEvents = sqliteTable(
  "status_page_subscriber_events",
  {
    id: text("id").primaryKey(),
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    subscriberId: text("subscriber_id")
      .notNull()
      .references(() => statusPageSubscribers.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // "incident_created" | "incident_updated" | "incident_resolved"
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    incidentUpdateId: text("incident_update_id").references(
      () => incidentUpdates.id,
      { onDelete: "cascade" }
    ),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at"),
  },
  (table) => ({
    subscriberSentIdx: index("sub_events_subscriber_sent_idx").on(
      table.subscriberId,
      table.sentAt
    ),
  })
);

export const statusPageSubscriberAuditLogs = sqliteTable(
  "status_page_subscriber_audit_logs",
  {
    id: text("id").primaryKey(),
    statusPageId: text("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    subscriberId: text("subscriber_id").references(
      () => statusPageSubscribers.id,
      {
        onDelete: "cascade",
      }
    ),
    action: text("action").notNull(),
    meta: text("meta", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: text("created_at").notNull(),
  }
);

export const notificationChannels = sqliteTable("notification_channels", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  type: text("type").notNull(),
  configJson: text("config_json").notNull(),
  enabled: integer("enabled").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const alertRules = sqliteTable(
  "alert_rules",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    name: text("name").notNull(),
    enabled: integer("enabled").notNull().default(1),
    sourceType: text("source_type").notNull(),
    projectId: text("project_id"),
    monitorId: text("monitor_id").references(() => monitors.id),
    environment: text("environment"),
    triggerType: text("trigger_type").notNull(),
    conditionsJson: text("conditions_json"),
    thresholdJson: text("threshold_json"),
    channelId: text("channel_id")
      .notNull()
      .references(() => notificationChannels.id),
    actionIntervalSeconds: integer("action_interval_seconds")
      .notNull()
      .default(3600),
    lastTriggeredAt: integer("last_triggered_at"),
    ownerId: text("owner_id"),

    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    monitorTriggerIdx: index("alert_rules_monitor_trigger_idx").on(
      table.monitorId,
      table.sourceType,
      table.triggerType,
      table.enabled
    ),
    projectSourceIdx: index("alert_rules_project_source_idx").on(
      table.teamId,
      table.sourceType,
      table.enabled
    ),
  })
);

export const alertRuleStates = sqliteTable(
  "alert_rule_states",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => alertRules.id),
    issueId: text("issue_id").notNull(),
    status: text("status").notNull(),
    triggeredAt: integer("triggered_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (table) => ({
    ruleIssueUnique: uniqueIndex("alert_rule_states_rule_issue_unique").on(
      table.ruleId,
      table.issueId
    ),
  })
);

export const alertRuleFires = sqliteTable("alert_rule_fires", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id")
    .notNull()
    .references(() => alertRules.id),
  issueId: text("issue_id"),
  eventId: text("event_id"),
  severity: text("severity").notNull(),
  triggerReason: text("trigger_reason").notNull(),
  firedAt: integer("fired_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  currentTeamId: text("current_team_id").references(() => teams.id),
  authProvider: text("auth_provider").notNull().default("custom"),
  cognitoSub: text("cognito_sub").unique(),
  mfaEnabled: integer("mfa_enabled").notNull().default(0),
  emailVerified: integer("email_verified").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});

export const queueDedupe = sqliteTable("queue_dedupe", {
  key: text("key").primaryKey(),
  createdAt: text("created_at").notNull(),
});

export const sloTargets = sqliteTable(
  "slo_targets",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    scopeType: text("scope_type").notNull(), // "monitor" | "component" | "status_page"
    scopeId: text("scope_id").notNull(),
    targetPpm: integer("target_ppm").notNull(), // 0..1_000_000 (e.g. 99.9% => 999_000)
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    teamScopeUnique: uniqueIndex("slo_targets_team_scope_unique").on(
      table.teamId,
      table.scopeType,
      table.scopeId
    ),
  })
);

export const userTeams = sqliteTable(
  "user_teams",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    role: text("role").notNull().default("member"),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.teamId] }),
  })
);

export const teamInvites = sqliteTable("team_invites", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  email: text("email"),
  inviteCode: text("invite_code").notNull().unique(),
  role: text("role").notNull().default("member"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const sentryProjects = sqliteTable("sentry_projects", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  sentryProjectId: integer("sentry_project_id").notNull().unique(),
  name: text("name").notNull(),
  platform: text("platform"),
  componentId: text("component_id").references(() => components.id),
  createdAt: text("created_at").notNull(),
});

export const sentryKeys = sqliteTable("sentry_keys", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => sentryProjects.id),
  publicKey: text("public_key").notNull(),
  secretKey: text("secret_key"),
  label: text("label"),
  status: text("status").notNull().default("active"),
  rateLimitPerMinute: integer("rate_limit_per_minute").default(1000),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
});

export const sentryIssues = sqliteTable(
  "sentry_issues",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => sentryProjects.id),
    fingerprint: text("fingerprint").notNull(),
    title: text("title").notNull(),
    culprit: text("culprit"),
    level: text("level").notNull(),
    status: text("status").notNull().default("unresolved"),
    assignedToUserId: text("assigned_to_user_id").references(() => users.id),
    assignedAt: integer("assigned_at"),
    snoozedUntil: integer("snoozed_until"),
    ignoredUntil: integer("ignored_until"),
    resolvedInRelease: text("resolved_in_release"),
    regressedAt: integer("regressed_at"),
    regressedCount: integer("regressed_count").notNull().default(0),
    eventCount: integer("event_count").notNull().default(1),
    userCount: integer("user_count").notNull().default(0),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    lastSeenRelease: text("last_seen_release"),
    lastSeenEnvironment: text("last_seen_environment"),
    resolvedAt: integer("resolved_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    projectFingerprintUnique: uniqueIndex(
      "sentry_issues_project_fingerprint_unique"
    ).on(table.projectId, table.fingerprint),
    projectLastSeenIdx: index("sentry_issues_project_last_seen_idx").on(
      table.projectId,
      table.lastSeenAt
    ),
    projectStatusIdx: index("sentry_issues_project_status_idx").on(
      table.projectId,
      table.status
    ),
  })
);

export const sentryIssueGroupingRules = sqliteTable(
  "sentry_issue_grouping_rules",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => sentryProjects.id),
    name: text("name").notNull(),
    enabled: integer("enabled").notNull().default(1),
    matchers: text("matchers", { mode: "json" }).$type<{
      exceptionType?: string;
      level?: string;
      messageIncludes?: string;
      culpritIncludes?: string;
      transactionIncludes?: string;
      frameIncludes?: string;
    }>(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    projectCreatedIdx: index(
      "sentry_issue_grouping_rules_project_created_idx"
    ).on(table.projectId, table.createdAt),
  })
);

export const sentryEvents = sqliteTable(
  "sentry_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => sentryProjects.id),
    type: text("type").notNull(),
    level: text("level"),
    message: text("message"),
    transaction: text("transaction"),
    fingerprint: text("fingerprint"),
    issueId: text("issue_id").references(() => sentryIssues.id),
    release: text("release"),
    environment: text("environment"),
    r2Key: text("r2_key").notNull(),
    receivedAt: integer("received_at").notNull(),
    createdAt: text("created_at").notNull(),
    user: text("user", { mode: "json" }).$type<{
      id?: string;
      username?: string;
      email?: string;
      ip_address?: string;
    }>(),
    tags: text("tags", { mode: "json" }).$type<Record<string, string>>(),
    contexts: text("contexts", { mode: "json" }).$type<{
      device?: { [key: string]: {} };
      os?: { [key: string]: {} };
      runtime?: { [key: string]: {} };
      browser?: { [key: string]: {} };
      app?: { [key: string]: {} };
    }>(),
    request: text("request", { mode: "json" }).$type<{
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      data?: { [key: string]: {} };
    }>(),
    exception: text("exception", { mode: "json" }).$type<{
      values?: Array<{
        type?: string;
        value?: string;
        mechanism?: { [key: string]: {} };
        stacktrace?: { [key: string]: {} };
      }>;
    }>(),
    breadcrumbs: text("breadcrumbs", { mode: "json" }).$type<
      Array<{
        timestamp?: string;
        type?: string;
        category?: string;
        message?: string;
        level?: string;
        data?: { [key: string]: {} };
      }>
    >(),
  },
  (table) => ({
    issueReceivedIdx: index("sentry_events_issue_received_idx").on(
      table.issueId,
      table.receivedAt
    ),
    projectReceivedIdx: index("sentry_events_project_received_idx").on(
      table.projectId,
      table.receivedAt
    ),
  })
);

export const sentrySessions = sqliteTable("sentry_sessions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => sentryProjects.id),
  sessionId: text("session_id").notNull(),
  distinctId: text("distinct_id"),
  status: text("status").notNull(),
  errors: integer("errors").notNull().default(0),
  started: integer("started").notNull(),
  duration: integer("duration"),
  release: text("release"),
  environment: text("environment"),
  userAgent: text("user_agent"),
  receivedAt: integer("received_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sentryClientReports = sqliteTable("sentry_client_reports", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => sentryProjects.id),
  timestamp: integer("timestamp").notNull(),
  discardedEvents: text("discarded_events", { mode: "json" }).$type<
    Array<{ reason: string; category: string; quantity: number }>
  >(),
  receivedAt: integer("received_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamAiAssistantSettings = typeof teamAiAssistantSettings.$inferSelect;
export type NewTeamAiAssistantSettings = typeof teamAiAssistantSettings.$inferInsert;
export type TeamAiAssistantRun = typeof teamAiAssistantRuns.$inferSelect;
export type NewTeamAiAssistantRun = typeof teamAiAssistantRuns.$inferInsert;
export type TeamAiActionPolicy = typeof teamAiActionPolicies.$inferSelect;
export type NewTeamAiActionPolicy = typeof teamAiActionPolicies.$inferInsert;
export type TeamAiActionRun = typeof teamAiActionRuns.$inferSelect;
export type NewTeamAiActionRun = typeof teamAiActionRuns.$inferInsert;
export type TeamAiAction = typeof teamAiActions.$inferSelect;
export type NewTeamAiAction = typeof teamAiActions.$inferInsert;
export type TeamAiActionEvent = typeof teamAiActionEvents.$inferSelect;
export type NewTeamAiActionEvent = typeof teamAiActionEvents.$inferInsert;
export type TeamAiActionAttempt = typeof teamAiActionAttempts.$inferSelect;
export type NewTeamAiActionAttempt = typeof teamAiActionAttempts.$inferInsert;
export type TeamAiGithubRepoMapping =
  typeof teamAiGithubRepoMappings.$inferSelect;
export type NewTeamAiGithubRepoMapping =
  typeof teamAiGithubRepoMappings.$inferInsert;
export type Monitor = typeof monitors.$inferSelect;
export type NewMonitor = typeof monitors.$inferInsert;
export type MonitorGroup = typeof monitorGroups.$inferSelect;
export type NewMonitorGroup = typeof monitorGroups.$inferInsert;
export type MonitorState = typeof monitorState.$inferSelect;
export type NewMonitorState = typeof monitorState.$inferInsert;
export type StatusPage = typeof statusPages.$inferSelect;
export type NewStatusPage = typeof statusPages.$inferInsert;
export type Component = typeof components.$inferSelect;
export type NewComponent = typeof components.$inferInsert;
export type ComponentDependency = typeof componentDependencies.$inferSelect;
export type NewComponentDependency = typeof componentDependencies.$inferInsert;
export type Suppression = typeof suppressions.$inferSelect;
export type NewSuppression = typeof suppressions.$inferInsert;
export type SuppressionScope = typeof suppressionScopes.$inferSelect;
export type NewSuppressionScope = typeof suppressionScopes.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;
export type IncidentUpdate = typeof incidentUpdates.$inferSelect;
export type NewIncidentUpdate = typeof incidentUpdates.$inferInsert;
export type IncidentComponent = typeof incidentComponents.$inferSelect;
export type NewIncidentComponent = typeof incidentComponents.$inferInsert;
export type StatusPageSubscriber = typeof statusPageSubscribers.$inferSelect;
export type NewStatusPageSubscriber = typeof statusPageSubscribers.$inferInsert;
export type StatusPageSubscriberEvent =
  typeof statusPageSubscriberEvents.$inferSelect;
export type NewStatusPageSubscriberEvent =
  typeof statusPageSubscriberEvents.$inferInsert;
export type StatusPageSubscriberAuditLog =
  typeof statusPageSubscriberAuditLogs.$inferSelect;
export type NewStatusPageSubscriberAuditLog =
  typeof statusPageSubscriberAuditLogs.$inferInsert;
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type NewNotificationChannel = typeof notificationChannels.$inferInsert;
export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;
export type AlertRuleState = typeof alertRuleStates.$inferSelect;
export type NewAlertRuleState = typeof alertRuleStates.$inferInsert;
export type AlertRuleFire = typeof alertRuleFires.$inferSelect;
export type NewAlertRuleFire = typeof alertRuleFires.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type UserTeam = typeof userTeams.$inferSelect;
export type NewUserTeam = typeof userTeams.$inferInsert;
export type TeamInvite = typeof teamInvites.$inferSelect;
export type NewTeamInvite = typeof teamInvites.$inferInsert;
export type SentryProject = typeof sentryProjects.$inferSelect;
export type NewSentryProject = typeof sentryProjects.$inferInsert;
export type SentryKey = typeof sentryKeys.$inferSelect;
export type NewSentryKey = typeof sentryKeys.$inferInsert;
export type SentryIssue = typeof sentryIssues.$inferSelect;
export type NewSentryIssue = typeof sentryIssues.$inferInsert;
export type SentryEvent = typeof sentryEvents.$inferSelect;
export type NewSentryEvent = typeof sentryEvents.$inferInsert;
export type SentrySession = typeof sentrySessions.$inferSelect;
export type NewSentrySession = typeof sentrySessions.$inferInsert;
export type SentryClientReport = typeof sentryClientReports.$inferSelect;
export type NewSentryClientReport = typeof sentryClientReports.$inferInsert;
