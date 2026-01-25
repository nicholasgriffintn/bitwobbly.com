import { schema, nowIso, randomId } from "@bitwobbly/shared";
import { eq, and, ne, inArray, desc } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export async function listOpenIncidents(
  db: DrizzleD1Database,
  teamId: string,
  statusPageId: string | null,
) {
  const whereClause = statusPageId
    ? and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.statusPageId, statusPageId),
        ne(schema.incidents.status, "resolved"),
      )
    : and(
        eq(schema.incidents.teamId, teamId),
        ne(schema.incidents.status, "resolved"),
      );

  const incs = await db
    .select()
    .from(schema.incidents)
    .where(whereClause)
    .orderBy(schema.incidents.startedAt);

  if (!incs.length) return [];
  const incIds = incs.map((i) => i.id);
  const updates = incIds.length
    ? await db
        .select()
        .from(schema.incidentUpdates)
        .where(inArray(schema.incidentUpdates.incidentId, incIds))
        .orderBy(schema.incidentUpdates.createdAt)
    : [];

  const byId = new Map<string, typeof updates>();
  for (const u of updates) {
    const arr = byId.get(u.incidentId) || [];
    arr.push(u);
    byId.set(u.incidentId, arr);
  }

  return incs.map((i) => ({ ...i, updates: byId.get(i.id) || [] }));
}

export async function listRecentResolvedIncidents(
  db: DrizzleD1Database,
  teamId: string,
  statusPageId: string | null,
  daysBack: number = 30,
) {
  const cutoffTimestamp =
    Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60;

  const whereClause = statusPageId
    ? and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.statusPageId, statusPageId),
        eq(schema.incidents.status, 'resolved'),
      )
    : and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.status, 'resolved'),
      );

  const incs = await db
    .select()
    .from(schema.incidents)
    .where(whereClause)
    .orderBy(desc(schema.incidents.startedAt))
    .limit(50);

  const recentIncs = incs.filter((i) => (i.resolvedAt || 0) >= cutoffTimestamp);

  if (!recentIncs.length) return [];
  const incIds = recentIncs.map((i) => i.id);
  const updates = incIds.length
    ? await db
        .select()
        .from(schema.incidentUpdates)
        .where(inArray(schema.incidentUpdates.incidentId, incIds))
        .orderBy(schema.incidentUpdates.createdAt)
    : [];

  const byId = new Map<string, typeof updates>();
  for (const u of updates) {
    const arr = byId.get(u.incidentId) || [];
    arr.push(u);
    byId.set(u.incidentId, arr);
  }

  return recentIncs.map((i) => ({ ...i, updates: byId.get(i.id) || [] }));
}

export async function listAllIncidents(
  db: DrizzleD1Database,
  teamId: string,
  limit: number = 50,
) {
  const incs = await db
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.teamId, teamId))
    .orderBy(desc(schema.incidents.startedAt))
    .limit(limit);

  if (!incs.length) return [];
  const incIds = incs.map((i) => i.id);
  const updates = incIds.length
    ? await db
        .select()
        .from(schema.incidentUpdates)
        .where(inArray(schema.incidentUpdates.incidentId, incIds))
        .orderBy(schema.incidentUpdates.createdAt)
    : [];

  const byId = new Map<string, typeof updates>();
  for (const u of updates) {
    const arr = byId.get(u.incidentId) || [];
    arr.push(u);
    byId.set(u.incidentId, arr);
  }

  return incs.map((i) => ({ ...i, updates: byId.get(i.id) || [] }));
}

export async function createIncident(
  db: DrizzleD1Database,
  teamId: string,
  input: {
    title: string;
    status: string;
    statusPageId?: string;
    monitorId?: string;
    message?: string;
  },
) {
  const id = randomId("inc");
  const now = nowIso();
  const startedAt = Math.floor(Date.now() / 1000);

  await db.insert(schema.incidents).values({
    id,
    teamId,
    statusPageId: input.statusPageId || null,
    monitorId: input.monitorId || null,
    title: input.title,
    status: input.status,
    startedAt,
    resolvedAt: null,
    createdAt: now,
  });

  if (input.message) {
    const updateId = randomId("upd");
    await db.insert(schema.incidentUpdates).values({
      id: updateId,
      incidentId: id,
      message: input.message,
      status: input.status,
      createdAt: now,
    });
  }

  return { id };
}

export async function addIncidentUpdate(
  db: DrizzleD1Database,
  teamId: string,
  incidentId: string,
  input: { message: string; status: string },
) {
  const incident = await db
    .select()
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.id, incidentId),
      ),
    )
    .limit(1);

  if (!incident.length) {
    throw new Error("Incident not found");
  }

  const updateId = randomId("upd");
  const now = nowIso();

  await db.insert(schema.incidentUpdates).values({
    id: updateId,
    incidentId,
    message: input.message,
    status: input.status,
    createdAt: now,
  });

  const resolvedAt =
    input.status === "resolved" ? Math.floor(Date.now() / 1000) : null;

  await db
    .update(schema.incidents)
    .set({
      status: input.status,
      resolvedAt,
    })
    .where(eq(schema.incidents.id, incidentId));

  return { id: updateId };
}

export async function deleteIncident(
  db: DrizzleD1Database,
  teamId: string,
  incidentId: string,
) {
  await db
    .delete(schema.incidentUpdates)
    .where(eq(schema.incidentUpdates.incidentId, incidentId));
  await db
    .delete(schema.incidents)
    .where(
      and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.id, incidentId),
      ),
    );
}
