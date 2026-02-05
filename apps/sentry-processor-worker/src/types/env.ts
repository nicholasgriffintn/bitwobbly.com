import type { IssueAlertJob } from "@bitwobbly/shared";

export interface Env {
  DB: D1Database;
  SENTRY_RAW: R2Bucket;
  ALERT_JOBS: Queue<IssueAlertJob>;
  SENTRY_DSN: string;
}

export function assertEnv(env: Env): Env {
  const missing: string[] = [];
  if (!env.DB) missing.push("DB");
  if (!env.SENTRY_RAW) missing.push("SENTRY_RAW");
  if (!env.ALERT_JOBS) missing.push("ALERT_JOBS");
  if (!env.SENTRY_DSN) missing.push("SENTRY_DSN");

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return env;
}

export interface ProcessJob {
  manifest_id: string;
  sentry_project_id: number;
  project_id: string;
  received_at: number;
  item_type: string;
  event_id?: string;
  r2_raw_key: string;
  item_index: number;
}
