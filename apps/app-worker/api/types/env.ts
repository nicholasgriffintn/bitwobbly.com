import type {
  Queue,
  AnalyticsEngineDataset,
  D1Database,
  KVNamespace,
} from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ALERT_JOBS: Queue;
  AE?: AnalyticsEngineDataset;

  PUBLIC_TEAM_ID: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  ADMIN_API_TOKEN?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}
