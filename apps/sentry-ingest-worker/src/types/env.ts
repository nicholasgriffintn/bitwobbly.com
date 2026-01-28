import type { Queue, RateLimit } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  SENTRY_RAW: R2Bucket;
  SENTRY_PIPELINE: any;
  SENTRY_EVENTS: Queue;
  KV: KVNamespace;
  SENTRY_RATE_LIMITER: RateLimit;
}
