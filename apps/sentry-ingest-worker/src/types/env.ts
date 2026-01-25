import type { Queue } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  SENTRY_RAW: R2Bucket;
  SENTRY_PIPELINE: Pipeline;
  SENTRY_EVENTS: Queue;
  KV: KVNamespace;
}
