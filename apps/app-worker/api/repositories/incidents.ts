import { schema } from "@bitwobbly/shared";
import { eq, and, ne, inArray } from "drizzle-orm";
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
