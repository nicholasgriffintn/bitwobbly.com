import { schema, type DB } from "@bitwobbly/shared";
import { and, desc, eq, gte, lte } from "drizzle-orm";

export async function listSentryClientReports(
  db: DB,
  projectId: string,
  options: { since?: number; until?: number; limit?: number }
) {
  const conditions = [eq(schema.sentryClientReports.projectId, projectId)];

  if (options.since) {
    conditions.push(gte(schema.sentryClientReports.timestamp, options.since));
  }
  if (options.until) {
    conditions.push(lte(schema.sentryClientReports.timestamp, options.until));
  }

  return db
    .select()
    .from(schema.sentryClientReports)
    .where(and(...conditions))
    .orderBy(desc(schema.sentryClientReports.timestamp))
    .limit(options.limit ?? 200);
}
