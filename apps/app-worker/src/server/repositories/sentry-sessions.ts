import { schema, type DB } from "@bitwobbly/shared";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export async function listSentrySessions(
  db: DB,
  projectId: string,
  options: {
    since?: number;
    until?: number;
    release?: string;
    environment?: string;
    status?: string;
    limit?: number;
  }
) {
  const conditions = [eq(schema.sentrySessions.projectId, projectId)];

  if (options.since) {
    conditions.push(gte(schema.sentrySessions.receivedAt, options.since));
  }
  if (options.until) {
    conditions.push(lte(schema.sentrySessions.receivedAt, options.until));
  }
  if (options.release) {
    conditions.push(eq(schema.sentrySessions.release, options.release));
  }
  if (options.environment) {
    conditions.push(eq(schema.sentrySessions.environment, options.environment));
  }
  if (options.status) {
    conditions.push(eq(schema.sentrySessions.status, options.status));
  }

  return db
    .select()
    .from(schema.sentrySessions)
    .where(and(...conditions))
    .orderBy(desc(schema.sentrySessions.receivedAt))
    .limit(options.limit ?? 200);
}

export interface ReleaseHealthRow {
  release: string | null;
  environment: string | null;
  total_sessions: number;
  crashed_sessions: number;
  errored_sessions: number;
  crash_free_rate: number;
}

export async function getSentryReleaseHealth(
  db: DB,
  projectId: string,
  options: { since?: number; until?: number }
): Promise<ReleaseHealthRow[]> {
  const conditions = [eq(schema.sentrySessions.projectId, projectId)];

  if (options.since) {
    conditions.push(gte(schema.sentrySessions.receivedAt, options.since));
  }
  if (options.until) {
    conditions.push(lte(schema.sentrySessions.receivedAt, options.until));
  }

  const rows = await db
    .select({
      release: schema.sentrySessions.release,
      environment: schema.sentrySessions.environment,
      total: sql<number>`count(*)`,
      crashed: sql<number>`sum(case when ${schema.sentrySessions.status} = 'crashed' then 1 else 0 end)`,
      errored: sql<number>`sum(case when ${schema.sentrySessions.status} = 'errored' then 1 else 0 end)`,
    })
    .from(schema.sentrySessions)
    .where(and(...conditions))
    .groupBy(schema.sentrySessions.release, schema.sentrySessions.environment)
    .orderBy(desc(sql`count(*)`))
    .limit(100);

  return rows.map((row) => {
    const total = row.total ?? 0;
    const crashed = row.crashed ?? 0;
    const crashFreeRate = total > 0 ? (total - crashed) / total : 0;

    return {
      release: row.release ?? null,
      environment: row.environment ?? null,
      total_sessions: total,
      crashed_sessions: crashed,
      errored_sessions: row.errored ?? 0,
      crash_free_rate: crashFreeRate,
    };
  });
}
