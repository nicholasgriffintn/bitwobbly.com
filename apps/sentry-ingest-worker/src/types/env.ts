import type { Queue, RateLimit } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  SENTRY_RAW: R2Bucket;
  SENTRY_PIPELINE: any;
  SENTRY_EVENTS: Queue;
  KV: KVNamespace;
  SENTRY_RATE_LIMITER: RateLimit;
  SENTRY_DSN: string;
}

export function assertEnv(env: Env): Env {
  const missing: string[] = [];
  if (!env.DB) missing.push("DB");
  if (!env.SENTRY_RAW) missing.push("SENTRY_RAW");
  if (!env.SENTRY_PIPELINE) missing.push("SENTRY_PIPELINE");
  if (!env.SENTRY_EVENTS) missing.push("SENTRY_EVENTS");
  if (!env.KV) missing.push("KV");
  if (!env.SENTRY_RATE_LIMITER) missing.push("SENTRY_RATE_LIMITER");
  if (!env.SENTRY_DSN) missing.push("SENTRY_DSN");

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return env;
}
