import assert from "node:assert/strict";
import test from "node:test";

import { getUtcWeekStartKey } from "./date-utils.ts";

test("getUtcWeekStartKey returns Monday for a Monday date", () => {
  // Monday 2026-01-05
  const monday = new Date(Date.UTC(2026, 0, 5, 9, 0, 0));
  assert.equal(getUtcWeekStartKey(monday), "2026-01-05");
});

test("getUtcWeekStartKey returns previous Monday for a Wednesday", () => {
  // Wednesday 2026-01-07
  const wednesday = new Date(Date.UTC(2026, 0, 7, 9, 0, 0));
  assert.equal(getUtcWeekStartKey(wednesday), "2026-01-05");
});

test("getUtcWeekStartKey returns previous Monday for a Sunday", () => {
  // Sunday 2026-01-11
  const sunday = new Date(Date.UTC(2026, 0, 11, 9, 0, 0));
  assert.equal(getUtcWeekStartKey(sunday), "2026-01-05");
});

test("getUtcWeekStartKey handles month boundary", () => {
  // Thursday 2026-01-01, Monday would be 2025-12-29
  const newYearsDay = new Date(Date.UTC(2026, 0, 1, 9, 0, 0));
  assert.equal(getUtcWeekStartKey(newYearsDay), "2025-12-29");
});

test("getUtcWeekStartKey handles year boundary for Monday", () => {
  // Monday 2025-12-29
  const monday = new Date(Date.UTC(2025, 11, 29, 9, 0, 0));
  assert.equal(getUtcWeekStartKey(monday), "2025-12-29");
});
