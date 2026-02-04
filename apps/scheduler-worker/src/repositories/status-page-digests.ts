import { schema, type DB } from "@bitwobbly/shared";
import { and, asc, eq, isNull } from "drizzle-orm";

export async function listActiveDigestSubscribers(
  db: DB,
  cadence: "daily" | "weekly",
) {
  return db
    .select({
      id: schema.statusPageSubscribers.id,
    })
    .from(schema.statusPageSubscribers)
    .where(
      and(
        eq(schema.statusPageSubscribers.status, "active"),
        eq(schema.statusPageSubscribers.digestCadence, cadence),
      ),
    );
}

export async function listUnsentSubscriberEventIds(
  db: DB,
  subscriberId: string,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ id: schema.statusPageSubscriberEvents.id })
    .from(schema.statusPageSubscriberEvents)
    .where(
      and(
        eq(schema.statusPageSubscriberEvents.subscriberId, subscriberId),
        isNull(schema.statusPageSubscriberEvents.sentAt),
      ),
    )
    .orderBy(asc(schema.statusPageSubscriberEvents.createdAt))
    .limit(limit);

  return rows.map((r) => r.id);
}

