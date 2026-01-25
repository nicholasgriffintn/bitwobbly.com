import { createDb } from "@bitwobbly/shared";
import { instrumentD1WithSentry } from "@sentry/cloudflare";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export function getDb(d1: D1Database): DrizzleD1Database {
  return createDb(instrumentD1WithSentry(d1));
}
