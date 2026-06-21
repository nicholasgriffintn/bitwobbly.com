import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ISSUE_RETENTION_DAYS,
  DEFAULT_RETENTION_RUN_MAX_MS,
  getIssueRetentionConfig,
  getRetentionCutoffSeconds,
} from "./retention-config.ts";

test("getRetentionCutoffSeconds subtracts retention days from the scheduled time", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  assert.equal(
    getRetentionCutoffSeconds(now, 90),
    Math.floor(Date.parse("2026-03-17T12:00:00.000Z") / 1000)
  );
});

test("getIssueRetentionConfig uses a 90 day default", () => {
  const config = getIssueRetentionConfig({});

  assert.equal(config.retentionDays, DEFAULT_ISSUE_RETENTION_DAYS);
  assert.equal(config.retentionRunMaxMs, DEFAULT_RETENTION_RUN_MAX_MS);
});

test("getIssueRetentionConfig accepts positive integer overrides", () => {
  const config = getIssueRetentionConfig({
    ISSUE_RETENTION_DAYS: "45",
    EVENT_DELETE_BATCH_SIZE: "250",
    R2_DELETE_BATCH_SIZE: "50",
    CATALOG_LIST_LIMIT: "75",
    RETENTION_RUN_MAX_MS: "120000",
  });

  assert.deepEqual(config, {
    retentionDays: 45,
    eventDeleteBatchSize: 250,
    r2DeleteBatchSize: 50,
    catalogListLimit: 75,
    retentionRunMaxMs: 120000,
  });
});

test("getIssueRetentionConfig rejects invalid retention days", () => {
  assert.throws(
    () => getIssueRetentionConfig({ ISSUE_RETENTION_DAYS: "0" }),
    /ISSUE_RETENTION_DAYS must be a positive integer/
  );
});
