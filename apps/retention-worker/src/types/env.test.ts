import assert from "node:assert/strict";
import test from "node:test";

import { assertEnv, type Env } from "./env.ts";

test("assertEnv returns env when required fields are present", () => {
  const env: Partial<Env> = {
    DB: {} as D1Database,
    SENTRY_RAW: {} as R2Bucket,
    SENTRY_CATALOG: {} as R2Bucket,
    SENTRY_DSN: "dsn",
    ISSUE_RETENTION_DAYS: "90",
  };

  const result = assertEnv(env);
  assert.equal(result.DB, env.DB);
  assert.equal(result.SENTRY_RAW, env.SENTRY_RAW);
  assert.equal(result.SENTRY_CATALOG, env.SENTRY_CATALOG);
  assert.equal(result.SENTRY_DSN, "dsn");
  assert.equal(result.ISSUE_RETENTION_DAYS, "90");
});

test("assertEnv throws with missing required fields", () => {
  const env: Partial<Env> = {
    DB: {} as D1Database,
    SENTRY_RAW: {} as R2Bucket,
    SENTRY_DSN: "",
  };

  assert.throws(
    () => assertEnv(env),
    /Missing environment variables: SENTRY_CATALOG, SENTRY_DSN/
  );
});
