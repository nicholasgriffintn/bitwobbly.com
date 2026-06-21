export const DEFAULT_ISSUE_RETENTION_DAYS = 90;
export const DEFAULT_EVENT_DELETE_BATCH_SIZE = 500;
export const DEFAULT_R2_DELETE_BATCH_SIZE = 100;
export const DEFAULT_CATALOG_LIST_LIMIT = 1000;
export const DEFAULT_RETENTION_RUN_MAX_MS = 25_000;

export interface IssueRetentionConfig {
  retentionDays: number;
  eventDeleteBatchSize: number;
  r2DeleteBatchSize: number;
  catalogListLimit: number;
  retentionRunMaxMs: number;
}

export interface IssueRetentionConfigEnv {
  ISSUE_RETENTION_DAYS?: string;
  EVENT_DELETE_BATCH_SIZE?: string;
  R2_DELETE_BATCH_SIZE?: string;
  CATALOG_LIST_LIMIT?: string;
  RETENTION_RUN_MAX_MS?: string;
}

export function getRetentionCutoffSeconds(
  now: Date,
  retentionDays: number
): number {
  return Math.floor(now.getTime() / 1000) - retentionDays * 24 * 60 * 60;
}

export function getIssueRetentionConfig(
  env: IssueRetentionConfigEnv
): IssueRetentionConfig {
  return {
    retentionDays: readPositiveInteger(
      env.ISSUE_RETENTION_DAYS,
      "ISSUE_RETENTION_DAYS",
      DEFAULT_ISSUE_RETENTION_DAYS
    ),
    eventDeleteBatchSize: readPositiveInteger(
      env.EVENT_DELETE_BATCH_SIZE,
      "EVENT_DELETE_BATCH_SIZE",
      DEFAULT_EVENT_DELETE_BATCH_SIZE
    ),
    r2DeleteBatchSize: readPositiveInteger(
      env.R2_DELETE_BATCH_SIZE,
      "R2_DELETE_BATCH_SIZE",
      DEFAULT_R2_DELETE_BATCH_SIZE
    ),
    catalogListLimit: readPositiveInteger(
      env.CATALOG_LIST_LIMIT,
      "CATALOG_LIST_LIMIT",
      DEFAULT_CATALOG_LIST_LIMIT
    ),
    retentionRunMaxMs: readPositiveInteger(
      env.RETENTION_RUN_MAX_MS,
      "RETENTION_RUN_MAX_MS",
      DEFAULT_RETENTION_RUN_MAX_MS
    ),
  };
}

function readPositiveInteger(
  value: string | undefined,
  name: string,
  fallback: number
): number {
  if (value === undefined || value.trim() === "") return fallback;

  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}
