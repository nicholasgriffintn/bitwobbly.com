export interface Env {
  DB: D1Database;
  SENTRY_RAW: R2Bucket;
  SENTRY_CATALOG: R2Bucket;
  SENTRY_DSN: string;
  ISSUE_RETENTION_DAYS?: string;
  EVENT_DELETE_BATCH_SIZE?: string;
  R2_DELETE_BATCH_SIZE?: string;
  CATALOG_LIST_LIMIT?: string;
}

export function assertEnv(env: Partial<Env>): Env {
  const missing: string[] = [];
  const DB = requireBinding(env.DB, "DB", missing);
  const SENTRY_RAW = requireBinding(env.SENTRY_RAW, "SENTRY_RAW", missing);
  const SENTRY_CATALOG = requireBinding(
    env.SENTRY_CATALOG,
    "SENTRY_CATALOG",
    missing
  );
  const SENTRY_DSN = requireBinding(env.SENTRY_DSN, "SENTRY_DSN", missing);

  if (missing.length || !DB || !SENTRY_RAW || !SENTRY_CATALOG || !SENTRY_DSN) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return {
    DB,
    SENTRY_RAW,
    SENTRY_CATALOG,
    SENTRY_DSN,
    ISSUE_RETENTION_DAYS: env.ISSUE_RETENTION_DAYS,
    EVENT_DELETE_BATCH_SIZE: env.EVENT_DELETE_BATCH_SIZE,
    R2_DELETE_BATCH_SIZE: env.R2_DELETE_BATCH_SIZE,
    CATALOG_LIST_LIMIT: env.CATALOG_LIST_LIMIT,
  };
}

function requireBinding<T>(
  value: T | null | undefined,
  name: string,
  missing: string[]
): T | null {
  if (!value) {
    missing.push(name);
    return null;
  }

  return value;
}
