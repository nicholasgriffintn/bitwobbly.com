import { schema } from "@bitwobbly/shared";
import { eq } from "drizzle-orm";

import type { DB } from "@bitwobbly/shared";

export async function hasCompletedQueueJob(
  db: DB,
  key: string
): Promise<boolean> {
  const rows = await db
    .select({ key: schema.queueDedupe.key })
    .from(schema.queueDedupe)
    .where(eq(schema.queueDedupe.key, key))
    .limit(1);

  return rows.length > 0;
}

export async function recordCompletedQueueJob(
  db: DB,
  key: string
): Promise<void> {
  await db
    .insert(schema.queueDedupe)
    .values({ key, createdAt: new Date().toISOString() })
    .onConflictDoNothing()
    .run();
}
