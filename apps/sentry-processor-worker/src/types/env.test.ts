import assert from "node:assert/strict";
import test from "node:test";

import { assertEnv, type Env } from "./env";

test("assertEnv returns env when required fields are present", () => {
  const env: Env = {
    DB: {} as D1Database,
    SENTRY_RAW: {} as R2Bucket,
    ALERT_JOBS: {} as Queue,
    SENTRY_DSN: "dsn",
  };

  assert.equal(assertEnv(env), env);
});

test("assertEnv throws with missing fields", () => {
  const env = {
    DB: {} as D1Database,
    SENTRY_RAW: {} as R2Bucket,
    ALERT_JOBS: {} as Queue,
    SENTRY_DSN: "",
  } as Env;

  assert.throws(
    () => assertEnv(env),
    /Missing environment variables: SENTRY_DSN/
  );
});
