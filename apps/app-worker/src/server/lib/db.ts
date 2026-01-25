import { createDb, type DB } from "@bitwobbly/shared";

export function getDb(d1: D1Database): DB {
  return createDb(d1);
}
