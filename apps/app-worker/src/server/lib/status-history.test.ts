import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmptyHistory,
  computeHistoryFromBuckets,
  getHistoricalBucketsForMonitors,
} from "./status-history.ts";

test("computeHistoryFromBuckets marks degraded when uptime is between 50 and 99", () => {
  const todayKey = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const buckets = new Map([[todayKey, { upCount: 1, downCount: 1 }]]);

  const [day] = computeHistoryFromBuckets(buckets, 1);
  assert.equal(day.date, todayKey);
  assert.equal(day.status, "degraded");
  assert.equal(day.uptimePercentage, 50);
});

test("buildEmptyHistory uses 0% uptime for unknown", () => {
  const [day] = buildEmptyHistory(1, "unknown");
  assert.equal(day.status, "unknown");
  assert.equal(day.uptimePercentage, 0);
});

test("getHistoricalBucketsForMonitors groups counts by monitor and day", async () => {
  const originalFetch = globalThis.fetch;

  const dayKey = new Date("2026-02-01T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        data: [
          { monitorId: "m1", status: "up", timestamp: "2026-02-01T12:00:00Z" },
          {
            monitorId: "m1",
            status: "down",
            timestamp: "2026-02-01T13:00:00Z",
          },
          { monitorId: "m2", status: "up", timestamp: "2026-02-01T14:00:00Z" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const buckets = await getHistoricalBucketsForMonitors(
      "acc",
      "token",
      ["m1", "m2"],
      1
    );

    assert.ok(buckets);
    assert.equal(buckets.get("m1")?.get(dayKey)?.upCount, 1);
    assert.equal(buckets.get("m1")?.get(dayKey)?.downCount, 1);
    assert.equal(buckets.get("m2")?.get(dayKey)?.upCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
