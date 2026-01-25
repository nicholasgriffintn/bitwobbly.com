import { drizzle } from "drizzle-orm/d1";
import { instrumentD1WithSentry } from "@sentry/cloudflare";
import * as schema from "@bitwobbly/shared/schema";

export function getDb(d1: D1Database) {
  return drizzle(instrumentD1WithSentry(d1), { schema });
}

export type DB = ReturnType<typeof getDb>;
