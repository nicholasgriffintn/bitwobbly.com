import type { Queue } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ALERT_JOBS: Queue;

  // Vars/secrets
  PUBLIC_TEAM_ID: string;
  ADMIN_API_TOKEN?: string;

  // Optional Analytics Engine (binding name up to you)
  AE?: AnalyticsEngineDataset;
}
