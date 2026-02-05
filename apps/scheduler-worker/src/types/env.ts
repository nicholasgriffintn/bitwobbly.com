import type { Queue } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  ALERT_JOBS: Queue;
  CHECK_JOBS: Queue;
  SENTRY_DSN: string;
}

export function assertEnv(env: Env): Env {
  const missing: string[] = [];
  if (!env.DB) missing.push("DB");
  if (!env.ALERT_JOBS) missing.push("ALERT_JOBS");
  if (!env.CHECK_JOBS) missing.push("CHECK_JOBS");
  if (!env.SENTRY_DSN) missing.push("SENTRY_DSN");

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return env;
}
