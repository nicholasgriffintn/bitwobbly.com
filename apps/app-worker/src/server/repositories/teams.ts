import { schema, nowIso, type DB } from "@bitwobbly/shared";

export async function ensureDemoTeam(db: DB, teamId: string) {
  await db
    .insert(schema.teams)
    .values({
      id: teamId,
      name: "Demo Team",
      createdAt: nowIso(),
    })
    .onConflictDoNothing();
}
