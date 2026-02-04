import { schema, type DB } from "@bitwobbly/shared";
import { lte } from "drizzle-orm";

export async function cleanupExpiredSessions(db: DB, nowSec: number) {
  const result = await db
    .delete(schema.sessions)
    .where(lte(schema.sessions.expiresAt, nowSec))
    .run();

  return result.meta.changes || 0;
}
