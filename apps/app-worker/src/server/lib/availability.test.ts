import test from "node:test";
import assert from "node:assert/strict";

import {
  computeAvailability,
  computeAvailabilityBuckets,
  utcMonthRange,
} from "./availability.ts";

test("computeAvailability returns 100% with no downtime", () => {
  const res = computeAvailability({
    fromSec: 0,
    toSec: 100,
    downtimeIntervals: [],
    maintenanceIntervals: [],
    targetPpm: null,
  });

  assert.equal(res.summary.totalSeconds, 100);
  assert.equal(res.summary.downtimeSeconds, 0);
  assert.equal(res.summary.uptimePpm, 1_000_000);
});

test("computeAvailability excludes maintenance from denominator and downtime", () => {
  const res = computeAvailability({
    fromSec: 0,
    toSec: 100,
    maintenanceIntervals: [{ start: 40, end: 60 }],
    downtimeIntervals: [{ start: 50, end: 80 }],
    targetPpm: null,
  });

  assert.equal(res.summary.totalSeconds, 100);
  assert.equal(res.summary.maintenanceSeconds, 20);
  assert.equal(res.summary.effectiveTotalSeconds, 80);
  assert.equal(res.summary.downtimeSeconds, 20);
  // 60/80 = 75%
  assert.equal(res.summary.uptimePpm, 750_000);
});

test("computeAvailability computes error budget against target", () => {
  const res = computeAvailability({
    fromSec: 0,
    toSec: 1000,
    maintenanceIntervals: [],
    downtimeIntervals: [{ start: 0, end: 10 }],
    targetPpm: 990_000, // 99%
  });

  assert.ok(res.summary.errorBudget);
  assert.equal(res.summary.errorBudget!.allowedDowntimeSeconds, 10);
  assert.equal(res.summary.errorBudget!.burnedDowntimeSeconds, 10);
  assert.equal(res.summary.errorBudget!.remainingDowntimeSeconds, 0);
});

test("computeAvailabilityBuckets splits by UTC hour boundary", () => {
  const fromSec = Math.floor(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000);
  const toSec = fromSec + 2 * 60 * 60;

  const res = computeAvailability({
    fromSec,
    toSec,
    maintenanceIntervals: [{ start: fromSec, end: fromSec + 30 * 60 }],
    downtimeIntervals: [{ start: fromSec + 45 * 60, end: fromSec + 75 * 60 }],
    targetPpm: null,
  });

  const buckets = computeAvailabilityBuckets({
    fromSec,
    toSec,
    downtimeOutsideMaintenance: res.downtimeOutsideMaintenance,
    maintenance: res.maintenance,
    bucket: "hour",
  }).buckets;

  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].start, fromSec);
  assert.equal(buckets[0].end, fromSec + 60 * 60);
  assert.equal(buckets[0].maintenanceSeconds, 30 * 60);
  assert.equal(buckets[0].downtimeSeconds, 15 * 60); // 45..60

  assert.equal(buckets[1].start, fromSec + 60 * 60);
  assert.equal(buckets[1].maintenanceSeconds, 0);
  assert.equal(buckets[1].downtimeSeconds, 15 * 60); // 60..75
});

test("utcMonthRange returns correct UTC boundaries", () => {
  const { fromSec, toSec } = utcMonthRange("2026-02");
  const fromIso = new Date(fromSec * 1000).toISOString();
  const toIso = new Date(toSec * 1000).toISOString();
  assert.equal(fromIso, "2026-02-01T00:00:00.000Z");
  assert.equal(toIso, "2026-03-01T00:00:00.000Z");
});

