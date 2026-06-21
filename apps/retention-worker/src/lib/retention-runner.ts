import { createLogger } from "@bitwobbly/shared";

import type { IssueRetentionConfig } from "./retention-config.ts";
import { getRetentionCutoffSeconds } from "./retention-config.ts";
import type { Env } from "../types/env.ts";

const logger = createLogger({ service: "retention-worker" });

export interface D1IssueRetentionInput {
  cutoffSeconds: number;
  eventDeleteBatchSize: number;
  shouldContinue?: () => boolean;
}

export interface D1IssueRetentionResult {
  r2Keys: string[];
  deletedEvents: number;
  deletedSessions: number;
  deletedClientReports: number;
  deletedIssues: number;
}

export interface CatalogRetentionInput {
  cutoffSeconds: number;
  listLimit: number;
  deleteBatchSize: number;
}

export interface CatalogRetentionResult {
  scanned: number;
  deleted: number;
}

export interface IssueRetentionSummary extends D1IssueRetentionResult {
  deletedRawObjects: number;
  scannedCatalogObjects: number;
  deletedCatalogObjects: number;
  cutoffSeconds: number;
  retentionDays: number;
}

export async function runIssueRetention(
  env: Env,
  config: IssueRetentionConfig,
  now: Date
): Promise<IssueRetentionSummary> {
  const cutoffSeconds = getRetentionCutoffSeconds(now, config.retentionDays);
  const deadlineMs = Date.now() + config.retentionRunMaxMs;
  const d1Result = await runD1IssueRetention(env.DB, {
    cutoffSeconds,
    eventDeleteBatchSize: config.eventDeleteBatchSize,
    shouldContinue: () => Date.now() < deadlineMs,
  });
  const deletedRawObjects = await deleteR2Keys(
    env.SENTRY_RAW,
    d1Result.r2Keys,
    config.r2DeleteBatchSize
  );
  const catalogResult = await deleteOldCatalogObjects(env.SENTRY_CATALOG, {
    cutoffSeconds,
    listLimit: config.catalogListLimit,
    deleteBatchSize: config.r2DeleteBatchSize,
  });

  const summary = {
    ...d1Result,
    deletedRawObjects,
    scannedCatalogObjects: catalogResult.scanned,
    deletedCatalogObjects: catalogResult.deleted,
    cutoffSeconds,
    retentionDays: config.retentionDays,
  };

  logger.info("issue retention completed", summary);
  return summary;
}

export async function runD1IssueRetention(
  db: D1Database,
  input: D1IssueRetentionInput
): Promise<D1IssueRetentionResult> {
  const shouldContinue = input.shouldContinue ?? (() => true);
  const eventResult = await deleteOldEventBatches(db, input, shouldContinue);

  return {
    r2Keys: eventResult.r2Keys,
    deletedEvents: eventResult.deleted,
    deletedSessions: await deleteOldRowsInBatches(
      db,
      "sentry_sessions",
      "received_at",
      input,
      shouldContinue
    ),
    deletedClientReports: await deleteOldRowsInBatches(
      db,
      "sentry_client_reports",
      "received_at",
      input,
      shouldContinue
    ),
    deletedIssues: await deleteOldIssuesInBatches(db, input, shouldContinue),
  };
}

async function deleteOldEventBatches(
  db: D1Database,
  input: D1IssueRetentionInput,
  shouldContinue: () => boolean
): Promise<{ deleted: number; r2Keys: string[] }> {
  let deleted = 0;
  const r2Keys: string[] = [];

  while (shouldContinue()) {
    const oldEventRows = await db
      .prepare(
        `
          SELECT r2_key AS r2Key
          FROM sentry_events
          WHERE received_at < ?
          ORDER BY received_at ASC
          LIMIT ?
        `
      )
      .bind(input.cutoffSeconds, input.eventDeleteBatchSize)
      .all();

    const results = await db.batch([
      db
        .prepare(
          `
            DELETE FROM sentry_events
            WHERE id IN (
              SELECT id
              FROM sentry_events
              WHERE received_at < ?
              ORDER BY received_at ASC
              LIMIT ?
            )
          `
        )
        .bind(input.cutoffSeconds, input.eventDeleteBatchSize),
    ]);
    const changes = readChanges(results[0]);
    deleted += changes;
    r2Keys.push(...oldEventRows.results.flatMap(readR2Key));

    if (changes === 0) break;
  }

  return { deleted, r2Keys };
}

async function deleteOldRowsInBatches(
  db: D1Database,
  tableName: "sentry_sessions" | "sentry_client_reports",
  cutoffColumn: "received_at",
  input: D1IssueRetentionInput,
  shouldContinue: () => boolean
): Promise<number> {
  let deleted = 0;

  while (shouldContinue()) {
    const results = await db.batch([
      db
        .prepare(
          `
            DELETE FROM ${tableName}
            WHERE id IN (
              SELECT id
              FROM ${tableName}
              WHERE ${cutoffColumn} < ?
              ORDER BY ${cutoffColumn} ASC
              LIMIT ?
            )
          `
        )
        .bind(input.cutoffSeconds, input.eventDeleteBatchSize),
    ]);
    const changes = readChanges(results[0]);
    deleted += changes;

    if (changes === 0) break;
  }

  return deleted;
}

async function deleteOldIssuesInBatches(
  db: D1Database,
  input: D1IssueRetentionInput,
  shouldContinue: () => boolean
): Promise<number> {
  let deleted = 0;

  while (shouldContinue()) {
    const results = await db.batch([
      db
        .prepare(
          `
            DELETE FROM sentry_issues
            WHERE id IN (
              SELECT issue.id
              FROM sentry_issues issue
              WHERE issue.last_seen_at < ?
                AND NOT EXISTS (
                  SELECT 1
                  FROM sentry_events event
                  WHERE event.issue_id = issue.id
                )
              ORDER BY issue.last_seen_at ASC
              LIMIT ?
            )
          `
        )
        .bind(input.cutoffSeconds, input.eventDeleteBatchSize),
    ]);
    const changes = readChanges(results[0]);
    deleted += changes;

    if (changes === 0) break;
  }

  return deleted;
}

export async function deleteR2Keys(
  bucket: R2Bucket,
  keys: string[],
  batchSize: number
): Promise<number> {
  const uniqueKeys = Array.from(new Set(keys.filter((key) => key.length > 0)));
  let deleted = 0;

  for (let index = 0; index < uniqueKeys.length; index += batchSize) {
    const batch = uniqueKeys.slice(index, index + batchSize);
    if (!batch.length) continue;

    await bucket.delete(batch);
    deleted += batch.length;
  }

  return deleted;
}

export async function deleteOldCatalogObjects(
  bucket: R2Bucket,
  input: CatalogRetentionInput
): Promise<CatalogRetentionResult> {
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;
  const cutoffMs = input.cutoffSeconds * 1000;

  do {
    const page = await bucket.list({
      cursor,
      limit: input.listLimit,
    });
    scanned += page.objects.length;

    const keys = page.objects
      .filter((object) => object.uploaded.getTime() < cutoffMs)
      .map((object) => object.key);
    deleted += await deleteR2Keys(bucket, keys, input.deleteBatchSize);

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return { scanned, deleted };
}

function readR2Key(row: unknown): string[] {
  if (!row || typeof row !== "object" || Array.isArray(row)) return [];

  const record = row as Record<string, unknown>;
  const key = record.r2Key ?? record.r2_key;
  return typeof key === "string" && key.length > 0 ? [key] : [];
}

function readChanges(result: D1Result | undefined): number {
  const changes = result?.meta?.changes;
  return typeof changes === "number" && Number.isFinite(changes) ? changes : 0;
}
