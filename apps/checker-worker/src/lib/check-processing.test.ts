import assert from "node:assert/strict";
import test from "node:test";

import {
  computeHeartbeatStatus,
  daysUntil,
  parseTargetHostPort,
} from "./monitor-utils.ts";

test("parseTargetHostPort parses host:port", () => {
  assert.deepEqual(parseTargetHostPort("example.com:123", 80), {
    hostname: "example.com",
    port: 123,
  });
});

test("parseTargetHostPort parses https URL default port", () => {
  assert.deepEqual(parseTargetHostPort("https://example.com/health", 80), {
    hostname: "example.com",
    port: 443,
  });
});

test("parseTargetHostPort uses default port for bare host", () => {
  assert.deepEqual(parseTargetHostPort("example.com", 9999), {
    hostname: "example.com",
    port: 9999,
  });
});

test("computeHeartbeatStatus marks missing check-ins as down", () => {
  const result = computeHeartbeatStatus({
    nowSec: 200,
    lastSeenSec: 100,
    intervalSec: 60,
    graceSec: 10,
  });
  assert.equal(result.status, "down");
  assert.match(result.reason ?? "", /No heartbeat/);
});

test("computeHeartbeatStatus marks recent check-ins as up", () => {
  const result = computeHeartbeatStatus({
    nowSec: 200,
    lastSeenSec: 160,
    intervalSec: 60,
    graceSec: 10,
  });
  assert.deepEqual(result, { status: "up" });
});

test("daysUntil floors to whole days", () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const expiry = now + 10.9 * 24 * 60 * 60 * 1000;
  assert.equal(daysUntil(expiry, now), 10);
});
