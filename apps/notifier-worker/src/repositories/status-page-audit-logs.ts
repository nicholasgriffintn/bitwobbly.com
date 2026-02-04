import { nowIso, randomId, schema, type DB } from "@bitwobbly/shared";

export async function insertStatusPageAuditLog(
  db: DB,
  input: {
    statusPageId: string;
    subscriberId?: string | null;
    action: string;
    meta?: Record<string, unknown> | null;
  },
) {
  await db.insert(schema.statusPageSubscriberAuditLogs).values({
    id: randomId("spal"),
    statusPageId: input.statusPageId,
    subscriberId: input.subscriberId || null,
    action: input.action,
    meta: input.meta ?? null,
    createdAt: nowIso(),
  });
}

