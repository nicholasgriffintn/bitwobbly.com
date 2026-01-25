import { schema } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";
import type { DB } from "../lib/db";

export async function validateDsn(
  db: DB,
  sentryProjectId: number,
  publicKey: string,
): Promise<{ id: string; teamId: string } | null> {
  const results = await db
    .select({
      id: schema.sentryProjects.id,
      teamId: schema.sentryProjects.teamId,
    })
    .from(schema.sentryProjects)
    .innerJoin(
      schema.sentryKeys,
      eq(schema.sentryKeys.projectId, schema.sentryProjects.id),
    )
    .where(
      and(
        eq(schema.sentryProjects.sentryProjectId, sentryProjectId),
        eq(schema.sentryKeys.publicKey, publicKey),
        eq(schema.sentryKeys.status, "active"),
      ),
    )
    .limit(1);

  return results[0] || null;
}
