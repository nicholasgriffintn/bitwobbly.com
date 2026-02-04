import { schema, type DB } from "@bitwobbly/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";

export type DeliverableSubscriberEvent = {
  eventId: string;
  eventType: string;
  eventCreatedAt: string;
  incidentId: string;
  incidentTitle: string;
  incidentStatus: string;
  updateMessage: string | null;
  updateStatus: string | null;
  updateCreatedAt: string | null;
  pageSlug: string;
  pageName: string;
  statusPageId: string;
};

export async function listUnsentSubscriberEventsByIds(
  db: DB,
  subscriberId: string,
  eventIds: string[],
): Promise<DeliverableSubscriberEvent[]> {
  if (!eventIds.length) return [];

  return db
    .select({
      eventId: schema.statusPageSubscriberEvents.id,
      eventType: schema.statusPageSubscriberEvents.eventType,
      eventCreatedAt: schema.statusPageSubscriberEvents.createdAt,
      incidentId: schema.incidents.id,
      incidentTitle: schema.incidents.title,
      incidentStatus: schema.incidents.status,
      updateMessage: schema.incidentUpdates.message,
      updateStatus: schema.incidentUpdates.status,
      updateCreatedAt: schema.incidentUpdates.createdAt,
      pageSlug: schema.statusPages.slug,
      pageName: schema.statusPages.name,
      statusPageId: schema.statusPages.id,
    })
    .from(schema.statusPageSubscriberEvents)
    .innerJoin(
      schema.incidents,
      eq(schema.incidents.id, schema.statusPageSubscriberEvents.incidentId),
    )
    .leftJoin(
      schema.incidentUpdates,
      eq(
        schema.incidentUpdates.id,
        schema.statusPageSubscriberEvents.incidentUpdateId,
      ),
    )
    .innerJoin(
      schema.statusPages,
      eq(schema.statusPages.id, schema.statusPageSubscriberEvents.statusPageId),
    )
    .where(
      and(
        eq(schema.statusPageSubscriberEvents.subscriberId, subscriberId),
        inArray(schema.statusPageSubscriberEvents.id, eventIds),
        isNull(schema.statusPageSubscriberEvents.sentAt),
      ),
    );
}

export async function markSubscriberEventsSent(
  db: DB,
  subscriberId: string,
  eventIds: string[],
  sentAtIso: string,
) {
  if (!eventIds.length) return;
  await db
    .update(schema.statusPageSubscriberEvents)
    .set({ sentAt: sentAtIso })
    .where(
      and(
        eq(schema.statusPageSubscriberEvents.subscriberId, subscriberId),
        inArray(schema.statusPageSubscriberEvents.id, eventIds),
      ),
    );
}

