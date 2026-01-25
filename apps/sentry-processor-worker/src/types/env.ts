export interface Env {
  DB: D1Database;
  SENTRY_RAW: R2Bucket;
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
