import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConicGradient,
  buildComponentStatusCounts,
  buildMonitorStatusCounts,
  buildPieSegments,
  buildTypeCounts,
  formatLatencyMs,
  formatPercent,
  formatStatusSectionLabel,
  getAverageLatencyMs,
  getLinkedMonitorCoverage,
} from "./visualisations.ts";

test("buildMonitorStatusCounts separates paused monitors from unknown checks", () => {
  const counts = buildMonitorStatusCounts([
    { type: "http", enabled: 1, state: { lastStatus: "up" } },
    { type: "http", enabled: 1, state: { lastStatus: "down" } },
    { type: "manual", enabled: 0, state: { lastStatus: "up" } },
    { type: "tls", enabled: 1, state: null },
  ]);

  assert.equal(counts.find((item) => item.status === "up")?.count, 1);
  assert.equal(counts.find((item) => item.status === "down")?.count, 1);
  assert.equal(counts.find((item) => item.status === "paused")?.count, 1);
  assert.equal(counts.find((item) => item.status === "unknown")?.count, 1);
});

test("getAverageLatencyMs ignores monitors without latency", () => {
  const average = getAverageLatencyMs([
    { type: "http", enabled: 1, state: { lastStatus: "up", lastLatencyMs: 40 } },
    { type: "http", enabled: 1, state: { lastStatus: "up", lastLatencyMs: null } },
    { type: "tls", enabled: 1, state: { lastStatus: "up", lastLatencyMs: 80 } },
  ]);

  assert.equal(average, 60);
});

test("buildTypeCounts orders common monitor types first", () => {
  const [first, second] = buildTypeCounts([
    { type: "tls", enabled: 1 },
    { type: "http", enabled: 1 },
    { type: "http", enabled: 1 },
  ]);

  assert.equal(first.type, "http");
  assert.equal(first.count, 2);
  assert.equal(second.type, "tls");
});

test("component status and coverage summaries handle missing status", () => {
  const components = [
    {
      id: "cmp_1",
      name: "API",
      monitorIds: ["mon_1"],
      dependencyIds: [],
      currentStatus: "operational",
    },
    {
      id: "cmp_2",
      name: "Worker",
      monitorIds: [],
      dependencyIds: ["cmp_1"],
      currentStatus: null,
    },
  ];

  const counts = buildComponentStatusCounts(components);

  assert.equal(counts.find((item) => item.status === "operational")?.count, 1);
  assert.equal(counts.find((item) => item.status === "unknown")?.count, 1);
  assert.equal(getLinkedMonitorCoverage(components), 50);
});

test("visual formatters keep compact operational labels", () => {
  assert.equal(formatPercent(49.6), "50%");
  assert.equal(formatLatencyMs(125), "125ms");
  assert.equal(formatLatencyMs(null), "No latency");
});

test("buildConicGradient maps status segments in count order", () => {
  const gradient = buildConicGradient(
    [
      { status: "up", count: 1, percent: 25 },
      { status: "down", count: 3, percent: 75 },
    ],
    { up: "green", down: "red", unknown: "gray" },
    "transparent"
  );

  assert.equal(gradient, "green 0% 25%, red 25% 100%");
});

test("buildPieSegments creates one path per visible status", () => {
  const segments = buildPieSegments(
    [
      { status: "up", count: 1, percent: 25 },
      { status: "down", count: 0, percent: 0 },
      { status: "unknown", count: 3, percent: 75 },
    ],
    { outerRadius: 50, innerRadius: 25, center: 60 }
  );

  assert.equal(segments.length, 2);
  assert.equal(segments[0].status, "up");
  assert.match(segments[0].path, /^M /);
  assert.equal(segments[1].status, "unknown");
});

test("formatStatusSectionLabel includes count and rounded percentage", () => {
  assert.equal(formatStatusSectionLabel("Up", 7, 63.6), "Up: 7 (64%)");
});
