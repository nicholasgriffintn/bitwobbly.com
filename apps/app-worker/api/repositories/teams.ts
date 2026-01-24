import { schema, nowIso } from "@bitwobbly/shared";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export async function ensureDemoTeam(db: DrizzleD1Database, teamId: string) {
  await db
    .insert(schema.teams)
    .values({
      id: teamId,
      name: "Demo Team",
      createdAt: nowIso(),
    })
    .onConflictDoNothing();
}
