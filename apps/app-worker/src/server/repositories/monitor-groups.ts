import { and, eq } from "drizzle-orm";
import { nowIso, randomId, schema, type DB } from "@bitwobbly/shared";

export async function listMonitorGroups(db: DB, teamId: string) {
  return db
    .select()
    .from(schema.monitorGroups)
    .where(eq(schema.monitorGroups.teamId, teamId))
    .orderBy(schema.monitorGroups.createdAt);
}

export async function createMonitorGroup(
  db: DB,
  teamId: string,
  input: { name: string; description?: string | null }
) {
  const id = randomId("mg");
  await db.insert(schema.monitorGroups).values({
    id,
    teamId,
    name: input.name,
    description: input.description || null,
    createdAt: nowIso(),
  });
  return { id };
}

export async function deleteMonitorGroup(db: DB, teamId: string, id: string) {
  await db
    .update(schema.monitors)
    .set({ groupId: null })
    .where(
      and(eq(schema.monitors.teamId, teamId), eq(schema.monitors.groupId, id))
    );

  await db
    .delete(schema.monitorGroups)
    .where(
      and(
        eq(schema.monitorGroups.teamId, teamId),
        eq(schema.monitorGroups.id, id)
      )
    );
}
