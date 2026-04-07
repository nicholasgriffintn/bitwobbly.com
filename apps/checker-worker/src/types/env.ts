import type { DurableObjectNamespace, Queue } from "@cloudflare/workers-types";
import type { AiActionWorkerMessage } from "@bitwobbly/shared";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ALERT_JOBS: Queue;
  ACTION_TRIGGER_JOBS: Queue<AiActionWorkerMessage>;
  INCIDENT_DO: DurableObjectNamespace;
  AE?: AnalyticsEngineDataset;
  SENTRY_DSN: string;
}

export function assertEnv(env: Env): Env {
  const missing: string[] = [];
  if (!env.DB) missing.push("DB");
  if (!env.KV) missing.push("KV");
  if (!env.ALERT_JOBS) missing.push("ALERT_JOBS");
  if (!env.ACTION_TRIGGER_JOBS) missing.push("ACTION_TRIGGER_JOBS");
  if (!env.INCIDENT_DO) missing.push("INCIDENT_DO");
  if (!env.SENTRY_DSN) missing.push("SENTRY_DSN");

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return env;
}
