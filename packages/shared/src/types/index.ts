export interface UptimeMetrics {
  period: string;
  uptimePercentage: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  incidents: number;
  totalDowntimeMinutes: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface CheckJob {
  job_id?: string;
  monitor_id: string;
  team_id: string;
  url: string;
  interval_seconds?: number;
  timeout_ms?: number;
  failure_threshold?: number;
  monitor_type?: MonitorType;
  external_config?: string;
  reported_status?: "up" | "down" | "degraded";
  reported_reason?: string;
}

export interface MonitorAlertJob {
  type: "monitor";
  alert_id: string;
  team_id: string;
  monitor_id: string;
  status: "up" | "down";
  reason?: string;
  incident_id?: string;
}

export interface IssueAlertJob {
  type: "issue";
  alert_id: string;
  team_id: string;
  rule_id: string;
  issue_id: string;
  event_id?: string;
  severity: "critical" | "warning" | "resolved";
  trigger_type: string;
  trigger_value?: number;
  threshold?: number;
  project_id: string;
  environment?: string;
}

export type AlertJob = MonitorAlertJob | IssueAlertJob;

export type AlertTriggerType =
  | "new_issue"
  | "issue_regression"
  | "event_threshold"
  | "user_threshold"
  | "status_change"
  | "high_priority"
  | "monitor_down"
  | "monitor_recovery";

export interface AlertThreshold {
  type: "static" | "percent_change";
  windowSeconds: number;
  metric: "count" | "count_unique_users" | "avg_events_per_hour";
  critical: number;
  warning?: number;
  resolved?: number;
  comparisonWindow?: "1h" | "1d" | "1w" | "30d";
}

export interface AlertConditions {
  level?: ("error" | "warning" | "info" | "debug")[];
  environment?: string[];
  tags?: Record<string, string>;
  issueAge?: string;
  release?: string;
  eventType?: ("error" | "default")[];
  monitorType?: MonitorType[];
  latencyThreshold?: number;
}

export interface MetricDataPoint {
  timestamp: string;
  uptimePercentage: number;
  latencyMs: number;
  status: "operational" | "degraded" | "down";
}

export interface ComponentMetrics {
  componentId: string;
  componentName: string;
  uptime: UptimeMetrics;
  dataPoints: MetricDataPoint[];
}

export const MonitorTypeValues = [
  "http",
  "http_assert",
  "http_keyword",
  "tls",
  "dns",
  "tcp",
  "ping",
  "heartbeat",
  "browser",
  "webhook",
  "external",
  "manual",
] as const;

export type MonitorType = (typeof MonitorTypeValues)[number];

export function isAlertJob(value: unknown): value is AlertJob {
  if (!value || typeof value !== "object") return false;

  const job = value as Record<string, unknown>;
  if (typeof job.type !== "string") return false;
  if (typeof job.alert_id !== "string") return false;
  if (typeof job.team_id !== "string") return false;

  if (job.type === "monitor") {
    return (
      typeof job.rule_id === "string" && typeof job.monitor_id === "string"
    );
  }

  if (job.type === "issue") {
    return typeof job.rule_id === "string" && typeof job.issue_id === "string";
  }

  return false;
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
