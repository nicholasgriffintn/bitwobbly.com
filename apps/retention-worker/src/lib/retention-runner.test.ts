import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteOldCatalogObjects,
  deleteR2Keys,
  runD1IssueRetention,
} from "./retention-runner.ts";

interface CapturedStatement {
  query: string;
  values: unknown[];
}

class FakeStatement {
  values: unknown[] = [];
  readonly query: string;
  private readonly rows: unknown[];

  constructor(query: string, rows: unknown[]) {
    this.query = query;
    this.rows = rows;
  }

  bind(...values: unknown[]): FakeStatement {
    this.values = values;
    return this;
  }

  async all(): Promise<{ results: unknown[] }> {
    return { results: this.rows };
  }
}

class FakeD1Database {
  readonly prepared: CapturedStatement[] = [];
  readonly batched: CapturedStatement[] = [];
  private readonly rows: unknown[];

  constructor(rows: unknown[] = []) {
    this.rows = rows;
  }

  prepare(query: string): FakeStatement {
    const statement = new FakeStatement(query, this.rows);
    this.prepared.push(statement);
    return statement;
  }

  async batch(
    statements: FakeStatement[]
  ): Promise<Array<{ meta: { changes: number } }>> {
    this.batched.push(
      ...statements.map((statement) => ({
        query: statement.query,
        values: statement.values,
      }))
    );

    return statements.map((_, index) => ({ meta: { changes: index + 1 } }));
  }
}

class FakeR2Bucket {
  readonly deleted: string[][] = [];
  private listIndex = 0;
  private readonly pages: Array<{
    objects: Array<{ key: string; uploaded: Date }>;
    truncated: boolean;
    cursor?: string;
  }>;

  constructor(
    pages: Array<{
      objects: Array<{ key: string; uploaded: Date }>;
      truncated: boolean;
      cursor?: string;
    }> = []
  ) {
    this.pages = pages;
  }

  async delete(keys: string | string[]): Promise<void> {
    this.deleted.push(Array.isArray(keys) ? keys : [keys]);
  }

  async list(): Promise<R2Objects> {
    const page = this.pages[this.listIndex] ?? {
      objects: [],
      truncated: false,
    };
    this.listIndex += 1;

    if (page.truncated) {
      return {
        objects: page.objects as R2Object[],
        delimitedPrefixes: [],
        truncated: true,
        cursor: page.cursor ?? "next",
      };
    }

    return {
      objects: page.objects as R2Object[],
      delimitedPrefixes: [],
      truncated: false,
    };
  }
}

test("runD1IssueRetention collects old R2 keys and runs bounded delete statements", async () => {
  const db = new FakeD1Database([
    { r2Key: "raw/1/old-a.envelope" },
    { r2_key: "raw/1/old-b.envelope" },
    { r2Key: "" },
  ]);

  const result = await runD1IssueRetention(db as unknown as D1Database, {
    cutoffSeconds: 1000,
    eventDeleteBatchSize: 2,
  });

  assert.deepEqual(result.r2Keys, [
    "raw/1/old-a.envelope",
    "raw/1/old-b.envelope",
  ]);
  assert.equal(result.deletedEvents, 1);
  assert.equal(result.deletedSessions, 2);
  assert.equal(result.deletedClientReports, 3);
  assert.equal(result.deletedIssues, 4);
  assert.equal(db.batched.length, 4);
  assert.match(db.batched[0]?.query ?? "", /DELETE FROM sentry_events/);
  assert.match(db.batched[3]?.query ?? "", /NOT EXISTS/);
  assert.deepEqual(db.batched[0]?.values, [1000, 2]);
});

test("deleteR2Keys deduplicates keys and deletes in batches", async () => {
  const bucket = new FakeR2Bucket();

  const deleted = await deleteR2Keys(
    bucket as unknown as R2Bucket,
    ["a", "b", "a", "", "c"],
    2
  );

  assert.equal(deleted, 3);
  assert.deepEqual(bucket.deleted, [["a", "b"], ["c"]]);
});

test("deleteOldCatalogObjects deletes only objects older than the cutoff", async () => {
  const bucket = new FakeR2Bucket([
    {
      objects: [
        { key: "old.parquet", uploaded: new Date("2026-01-01T00:00:00.000Z") },
        { key: "new.parquet", uploaded: new Date("2026-06-01T00:00:00.000Z") },
      ],
      truncated: true,
      cursor: "page-2",
    },
    {
      objects: [
        {
          key: "older.parquet",
          uploaded: new Date("2025-12-01T00:00:00.000Z"),
        },
      ],
      truncated: false,
    },
  ]);

  const result = await deleteOldCatalogObjects(bucket as unknown as R2Bucket, {
    cutoffSeconds: Math.floor(Date.parse("2026-03-01T00:00:00.000Z") / 1000),
    listLimit: 100,
    deleteBatchSize: 2,
  });

  assert.equal(result.scanned, 3);
  assert.equal(result.deleted, 2);
  assert.deepEqual(bucket.deleted, [["old.parquet"], ["older.parquet"]]);
});
