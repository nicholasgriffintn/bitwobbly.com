export type UUID = string;

export type MonitorType = 'http' | 'webhook' | 'external' | 'manual';

export type ExternalServiceType =
  | 'cloudflare-workers'
  | 'cloudflare-d1'
  | 'cloudflare-r2'
  | 'cloudflare-kv'
  | 'resend'
  | 'github'
  | 'custom';

export type ExternalMonitorConfig = {
  serviceType: ExternalServiceType;
  statusUrl?: string;
  checkInterval?: number;
};

export type CheckJob = {
  job_id: string;
  team_id: UUID;
  monitor_id: UUID;
  monitor_type: MonitorType;
  url: string;
  timeout_ms: number;
  failure_threshold: number;
  webhook_token?: string;
  external_config?: string;
};

export type AlertJob = {
  alert_id: string;
  team_id: UUID;
  monitor_id: UUID;
  status: "down" | "up";
  reason?: string;
  incident_id?: UUID;
};

export type NotificationChannelType = "webhook" | "email";
