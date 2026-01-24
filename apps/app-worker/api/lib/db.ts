import { createDb } from "@bitwobbly/shared";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export function getDb(d1: D1Database): DrizzleD1Database {
  return createDb(d1);
}
