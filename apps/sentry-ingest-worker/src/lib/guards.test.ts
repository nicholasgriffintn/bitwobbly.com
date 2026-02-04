import assert from "node:assert/strict";
import test from "node:test";

import { isRecord, isProjectCache } from "./guards.ts";

test("isRecord returns true for plain objects", () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord({ foo: "bar" }), true);
});

test("isRecord returns false for null", () => {
  assert.equal(isRecord(null), false);
});

test("isRecord returns false for arrays", () => {
  assert.equal(isRecord([]), false);
  assert.equal(isRecord([1, 2, 3]), false);
});

test("isRecord returns false for primitives", () => {
  assert.equal(isRecord("string"), false);
  assert.equal(isRecord(123), false);
  assert.equal(isRecord(undefined), false);
  assert.equal(isRecord(true), false);
});

test("isProjectCache returns true for valid project cache", () => {
  assert.equal(isProjectCache({ id: "proj_123", teamId: "team_456" }), true);
});

test("isProjectCache returns false for missing fields", () => {
  assert.equal(isProjectCache({ id: "proj_123" }), false);
  assert.equal(isProjectCache({ teamId: "team_456" }), false);
  assert.equal(isProjectCache({}), false);
});

test("isProjectCache returns false for wrong field types", () => {
  assert.equal(isProjectCache({ id: 123, teamId: "team_456" }), false);
  assert.equal(isProjectCache({ id: "proj_123", teamId: 456 }), false);
});

test("isProjectCache returns false for non-objects", () => {
  assert.equal(isProjectCache(null), false);
  assert.equal(isProjectCache([]), false);
  assert.equal(isProjectCache("string"), false);
});
