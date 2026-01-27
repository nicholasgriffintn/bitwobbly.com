import {
  text,
  integer,
  sqliteTable,
  primaryKey,
  index,
} from 'drizzle-orm/sqlite-core';

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const monitors = sqliteTable("monitors", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
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

export const statusPages = sqliteTable("status_pages", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  isPublic: integer("is_public").notNull().default(1),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color").default("#007bff"),
  customCss: text("custom_css"),
  createdAt: text("created_at").notNull(),
});

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
  }),
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
  }),
);

export const incidents = sqliteTable("incidents", {
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
});

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
  }),
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

export const notificationPolicies = sqliteTable("notification_policies", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  monitorId: text("monitor_id")
    .notNull()
    .references(() => monitors.id),
  channelId: text("channel_id")
    .notNull()
    .references(() => notificationChannels.id),
  thresholdFailures: integer("threshold_failures").notNull().default(3),
  notifyOnRecovery: integer("notify_on_recovery").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passwordHash: text('password_hash'),
  teamId: text('team_id')
    .notNull()
    .references(() => teams.id),
  currentTeamId: text('current_team_id').references(() => teams.id),
  authProvider: text('auth_provider').notNull().default('custom'),
  cognitoSub: text('cognito_sub').unique(),
  mfaEnabled: integer('mfa_enabled').notNull().default(0),
  emailVerified: integer('email_verified').notNull().default(0),
  lastLoginAt: integer('last_login_at'),
  createdAt: text('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
  lastUsedAt: integer('last_used_at').notNull(),
});

export const authChallenges = sqliteTable(
  'auth_challenges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    type: text('type').notNull(),
    method: text('method'),
    metadata: text('metadata'),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
    usedAt: integer('used_at'),
  },
  (table) => [
    index('auth_challenges_user_expires_idx').on(table.userId, table.expiresAt),
  ],
);

export const mfaCredentials = sqliteTable(
  'mfa_credentials',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(),
    secretEncrypted: text('secret_encrypted'),
    credentialId: text('credential_id'),
    publicKey: text('public_key'),
    counter: integer('counter').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('mfa_credentials_user_type_idx').on(table.userId, table.type),
    index('mfa_credentials_credential_id_idx').on(table.credentialId),
  ],
);

export const mfaRecoveryCodes = sqliteTable(
  'mfa_recovery_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    codeHash: text('code_hash').notNull().unique(),
    usedAt: integer('used_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('mfa_recovery_codes_user_idx').on(table.userId)],
);

export const loginAuditLogs = sqliteTable(
  'login_audit_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id').references(() => users.id),
    email: text('email'),
    event: text('event').notNull(),
    status: text('status').notNull(),
    reason: text('reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('login_audit_logs_user_idx').on(table.userId),
    index('login_audit_logs_email_idx').on(table.email),
    index('login_audit_logs_created_idx').on(table.createdAt),
  ],
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
  }),
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

export const sentryIssues = sqliteTable("sentry_issues", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => sentryProjects.id),
  fingerprint: text("fingerprint").notNull(),
  title: text("title").notNull(),
  culprit: text("culprit"),
  level: text("level").notNull(),
  status: text("status").notNull().default("unresolved"),
  eventCount: integer("event_count").notNull().default(1),
  userCount: integer("user_count").notNull().default(0),
  firstSeenAt: integer("first_seen_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  resolvedAt: integer("resolved_at"),
  createdAt: text("created_at").notNull(),
});

export const sentryEvents = sqliteTable("sentry_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => sentryProjects.id),
  type: text("type").notNull(),
  level: text("level"),
  message: text("message"),
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
    data?: {};
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
});

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
export type Monitor = typeof monitors.$inferSelect;
export type NewMonitor = typeof monitors.$inferInsert;
export type MonitorState = typeof monitorState.$inferSelect;
export type NewMonitorState = typeof monitorState.$inferInsert;
export type StatusPage = typeof statusPages.$inferSelect;
export type NewStatusPage = typeof statusPages.$inferInsert;
export type Component = typeof components.$inferSelect;
export type NewComponent = typeof components.$inferInsert;
export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;
export type IncidentUpdate = typeof incidentUpdates.$inferSelect;
export type NewIncidentUpdate = typeof incidentUpdates.$inferInsert;
export type IncidentComponent = typeof incidentComponents.$inferSelect;
export type NewIncidentComponent = typeof incidentComponents.$inferInsert;
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type NewNotificationChannel = typeof notificationChannels.$inferInsert;
export type NotificationPolicy = typeof notificationPolicies.$inferSelect;
export type NewNotificationPolicy = typeof notificationPolicies.$inferInsert;
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
