import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { instrumentD1WithSentry } from "@sentry/cloudflare";

import * as schema from "./schema.ts";

export function createDb(d1: D1Database): DrizzleD1Database<typeof schema> {
  return drizzle(d1, { schema });
}

export interface GetDbOptions {
  withSentry?: boolean;
}

export function getDb(
  d1: D1Database,
  options: GetDbOptions = {}
): DrizzleD1Database<typeof schema> {
  let database = d1;

  if (options.withSentry) {
    database = instrumentD1WithSentry(d1);
  }

  return drizzle(database, { schema });
}

export type DB = DrizzleD1Database<typeof schema>;
export { schema };
