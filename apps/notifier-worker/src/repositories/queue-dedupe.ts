import { schema } from "@bitwobbly/shared";

import type { DB } from "@bitwobbly/shared";

export async function acquireQueueDedupe(
  db: DB,
  key: string
): Promise<boolean> {
  const result = await db
    .insert(schema.queueDedupe)
    .values({ key, createdAt: new Date().toISOString() })
    .onConflictDoNothing()
    .run();

  return Boolean(result.meta.changes);
}
