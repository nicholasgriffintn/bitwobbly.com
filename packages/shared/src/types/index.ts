export type UUID = string;

export type CheckJob = {
  job_id: string;
  team_id: UUID;
  monitor_id: UUID;
  url: string;
  timeout_ms: number;
  failure_threshold: number;
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