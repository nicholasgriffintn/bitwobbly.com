import type {
  Queue,
  AnalyticsEngineDataset,
  D1Database,
  KVNamespace,
} from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ALERT_JOBS: Queue;
  AE?: AnalyticsEngineDataset;
  CF_ANALYTICS_ENGINE: AnalyticsEngineDataset;

  PUBLIC_TEAM_ID: string;
  ADMIN_API_TOKEN?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}
