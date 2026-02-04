import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeIntervals,
  clampIntervals,
  sumIntervalSeconds,
  subtractIntervals,
  sumOverlapSeconds,
} from "./intervals.ts";

test("mergeIntervals merges overlapping intervals", () => {
  const input = [
    { start: 0, end: 10 },
    { start: 5, end: 15 },
  ];
  assert.deepEqual(mergeIntervals(input), [{ start: 0, end: 15 }]);
});

test("mergeIntervals keeps non-overlapping intervals separate", () => {
  const input = [
    { start: 0, end: 10 },
    { start: 20, end: 30 },
  ];
  assert.deepEqual(mergeIntervals(input), [
    { start: 0, end: 10 },
    { start: 20, end: 30 },
  ]);

test("mergeIntervals handles adjacent intervals", () => {
  const input = [
    { start: 0, end: 10 },
    { start: 10, end: 20 },
  ];
  assert.deepEqual(mergeIntervals(input), [{ start: 0, end: 20 }]);
});

test("mergeIntervals filters invalid intervals", () => {
  const input = [
    { start: 10, end: 5 }, // end < start
    { start: 0, end: 10 },
    { start: NaN, end: 20 },
  ];
  assert.deepEqual(mergeIntervals(input), [{ start: 0, end: 10 }]);
});

test("mergeIntervals returns empty for empty input", () => {
  assert.deepEqual(mergeIntervals([]), []);
});

test("clampIntervals constrains to range", () => {
  const intervals = [
    { start: 0, end: 20 },
    { start: 30, end: 50 },
  ];
  const range = { start: 10, end: 40 };
  assert.deepEqual(clampIntervals(intervals, range), [
    { start: 10, end: 20 },
    { start: 30, end: 40 },
  ]);
});

test("clampIntervals excludes intervals outside range", () => {
  const intervals = [{ start: 0, end: 10 }];
  const range = { start: 20, end: 30 };
  assert.deepEqual(clampIntervals(intervals, range), []);
});

test("sumIntervalSeconds calculates total duration", () => {
  const intervals = [
    { start: 0, end: 10 },
    { start: 20, end: 30 },
  ];
  assert.equal(sumIntervalSeconds(intervals), 20);
});

test("subtractIntervals removes overlapping parts", () => {
  const base = [{ start: 0, end: 100 }];
  const subtract = [{ start: 20, end: 40 }];
  assert.deepEqual(subtractIntervals(base, subtract), [
    { start: 0, end: 20 },
    { start: 40, end: 100 },
  ]);
});

test("subtractIntervals handles multiple cuts", () => {
  const base = [{ start: 0, end: 100 }];
  const subtract = [
    { start: 10, end: 20 },
    { start: 50, end: 60 },
  ];
  assert.deepEqual(subtractIntervals(base, subtract), [
    { start: 0, end: 10 },
    { start: 20, end: 50 },
    { start: 60, end: 100 },
  ]);
});

test("subtractIntervals returns base when nothing to subtract", () => {
  const base = [{ start: 0, end: 10 }];
  assert.deepEqual(subtractIntervals(base, []), [{ start: 0, end: 10 }]);
});

test("subtractIntervals returns empty when base is empty", () => {
  assert.deepEqual(subtractIntervals([], [{ start: 0, end: 10 }]), []);
});

test("sumOverlapSeconds calculates overlap within range", () => {
  const intervals = [
    { start: 0, end: 20 },
    { start: 30, end: 50 },
  ];
  const range = { start: 10, end: 40 };
  // 10-20 = 10s, 30-40 = 10s = 20s total
  assert.equal(sumOverlapSeconds(intervals, range), 20);
});
