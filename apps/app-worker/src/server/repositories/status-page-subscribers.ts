import { schema, nowIso, randomId, sha256Hex, type DB } from "@bitwobbly/shared";
import { and, eq, inArray } from "drizzle-orm";

export type StatusPageDigestCadence = "immediate" | "daily" | "weekly";
export type StatusPageSubscriberChannel = "email" | "webhook";

export async function getSubscriberByEndpoint(
  db: DB,
  statusPageId: string,
  channelType: StatusPageSubscriberChannel,
  endpoint: string,
) {
  const rows = await db
    .select()
    .from(schema.statusPageSubscribers)
    .where(
      and(
        eq(schema.statusPageSubscribers.statusPageId, statusPageId),
        eq(schema.statusPageSubscribers.channelType, channelType),
        eq(schema.statusPageSubscribers.endpoint, endpoint),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

export async function createOrRefreshSubscription(
  db: DB,
  input: {
    statusPageId: string;
    channelType: StatusPageSubscriberChannel;
    endpoint: string;
    digestCadence: StatusPageDigestCadence;
    confirmToken: string;
    confirmExpiresAt: number;
  },
): Promise<{ subscriberId: string }> {
  const now = nowIso();
  const confirmTokenHash = await sha256Hex(input.confirmToken);

  const existing = await getSubscriberByEndpoint(
    db,
    input.statusPageId,
    input.channelType,
    input.endpoint,
  );

  if (existing) {
    await db
      .update(schema.statusPageSubscribers)
      .set({
        digestCadence: input.digestCadence,
        status: "pending",
        confirmTokenHash,
        confirmExpiresAt: input.confirmExpiresAt,
        confirmedAt: null,
        unsubscribedAt: null,
      })
      .where(eq(schema.statusPageSubscribers.id, existing.id));
    return { subscriberId: existing.id };
  }

  const subscriberId = randomId("sps");
  await db.insert(schema.statusPageSubscribers).values({
    id: subscriberId,
    statusPageId: input.statusPageId,
    channelType: input.channelType,
    endpoint: input.endpoint,
    digestCadence: input.digestCadence,
    status: "pending",
    confirmTokenHash,
    confirmExpiresAt: input.confirmExpiresAt,
    confirmedAt: null,
    unsubscribedAt: null,
    createdAt: now,
  });
  return { subscriberId };
}

export async function confirmSubscriptionByToken(
  db: DB,
  input: { statusPageId: string; confirmToken: string; nowSec: number },
): Promise<{ subscriberId: string } | null> {
  const tokenHash = await sha256Hex(input.confirmToken);
  const rows = await db
    .select()
    .from(schema.statusPageSubscribers)
    .where(
      and(
        eq(schema.statusPageSubscribers.statusPageId, input.statusPageId),
        eq(schema.statusPageSubscribers.confirmTokenHash, tokenHash),
      ),
    )
    .limit(2);

  if (rows.length !== 1) return null;
  const sub = rows[0];

  const expiresAt = Number(sub.confirmExpiresAt || 0);
  if (!expiresAt || expiresAt < input.nowSec) {
    return null;
  }

  await db
    .update(schema.statusPageSubscribers)
    .set({
      status: "active",
      confirmedAt: nowIso(),
      confirmTokenHash: null,
      confirmExpiresAt: null,
      unsubscribedAt: null,
    })
    .where(eq(schema.statusPageSubscribers.id, sub.id));

  return { subscriberId: sub.id };
}

export async function unsubscribeById(
  db: DB,
  input: { statusPageId: string; subscriberId: string },
): Promise<boolean> {
  const sub = await db
    .select({ id: schema.statusPageSubscribers.id })
    .from(schema.statusPageSubscribers)
    .where(
      and(
        eq(schema.statusPageSubscribers.statusPageId, input.statusPageId),
        eq(schema.statusPageSubscribers.id, input.subscriberId),
      ),
    )
    .limit(1);

  if (!sub.length) return false;

  await db
    .update(schema.statusPageSubscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: nowIso(),
      confirmTokenHash: null,
      confirmExpiresAt: null,
    })
    .where(eq(schema.statusPageSubscribers.id, input.subscriberId));

  return true;
}

export async function insertSubscriptionAuditLog(
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

export async function listDeliverableSubscribersForStatusPage(
  db: DB,
  statusPageId: string,
): Promise<
  Array<{
    id: string;
    channelType: StatusPageSubscriberChannel;
    digestCadence: StatusPageDigestCadence;
  }>
> {
  const rows = await db
    .select({
      id: schema.statusPageSubscribers.id,
      channelType: schema.statusPageSubscribers.channelType,
      digestCadence: schema.statusPageSubscribers.digestCadence,
    })
    .from(schema.statusPageSubscribers)
    .where(
      and(
        eq(schema.statusPageSubscribers.statusPageId, statusPageId),
        eq(schema.statusPageSubscribers.status, "active"),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    channelType: r.channelType as StatusPageSubscriberChannel,
    digestCadence: r.digestCadence as StatusPageDigestCadence,
  }));
}

export async function createSubscriberEvent(
  db: DB,
  input: {
    statusPageId: string;
    subscriberId: string;
    eventType: "incident_created" | "incident_updated" | "incident_resolved";
    incidentId: string;
    incidentUpdateId?: string | null;
  },
): Promise<{ eventId: string }> {
  const eventId = randomId("spev");
  await db.insert(schema.statusPageSubscriberEvents).values({
    id: eventId,
    statusPageId: input.statusPageId,
    subscriberId: input.subscriberId,
    eventType: input.eventType,
    incidentId: input.incidentId,
    incidentUpdateId: input.incidentUpdateId || null,
    createdAt: nowIso(),
    sentAt: null,
  });
  return { eventId };
}

export async function listStatusPageIdsForComponents(
  db: DB,
  teamId: string,
  componentIds: string[],
): Promise<string[]> {
  if (!componentIds.length) return [];
  const rows = await db
    .select({
      statusPageId: schema.statusPageComponents.statusPageId,
      teamId: schema.statusPages.teamId,
    })
    .from(schema.statusPageComponents)
    .innerJoin(
      schema.statusPages,
      eq(schema.statusPages.id, schema.statusPageComponents.statusPageId),
    )
    .where(inArray(schema.statusPageComponents.componentId, componentIds));

  return Array.from(
    new Set(
      rows
        .filter((r) => r.teamId === teamId)
        .map((r) => r.statusPageId),
    ),
  );
}
