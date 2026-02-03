import { createDb } from "@bitwobbly/shared";
import { instrumentD1WithSentry } from "@sentry/cloudflare";

export function getDb(d1: D1Database) {
  return createDb(instrumentD1WithSentry(d1));
}

export type DB = ReturnType<typeof getDb>;
