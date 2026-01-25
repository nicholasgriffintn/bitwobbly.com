import {
  text,
  integer,
  sqliteTable,
  primaryKey,
} from "drizzle-orm/sqlite-core";

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

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
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
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type NewNotificationChannel = typeof notificationChannels.$inferInsert;
export type NotificationPolicy = typeof notificationPolicies.$inferSelect;
export type NewNotificationPolicy = typeof notificationPolicies.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
