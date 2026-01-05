import type { DurableObjectNamespace, Queue } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ALERT_JOBS: Queue;
  INCIDENT_DO: DurableObjectNamespace;
  PUBLIC_TEAM_ID: string;
  AE?: AnalyticsEngineDataset;
}
