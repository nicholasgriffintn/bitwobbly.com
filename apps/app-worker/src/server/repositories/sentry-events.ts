import { schema, type DB } from "@bitwobbly/shared";
import { eq, and, desc, gte, lte } from "drizzle-orm";

export async function listSentryEvents(
  db: DB,
  projectId: string,
  options: { since?: number; until?: number; type?: string; limit?: number },
) {
  const conditions = [eq(schema.sentryEvents.projectId, projectId)];

  if (options.since) {
    conditions.push(gte(schema.sentryEvents.receivedAt, options.since));
  }
  if (options.until) {
    conditions.push(lte(schema.sentryEvents.receivedAt, options.until));
  }
  if (options.type) {
    conditions.push(eq(schema.sentryEvents.type, options.type));
  }

  return db
    .select()
    .from(schema.sentryEvents)
    .where(and(...conditions))
    .orderBy(desc(schema.sentryEvents.receivedAt))
    .limit(options.limit || 100);
}

export async function getSentryEvent(
  db: DB,
  projectId: string,
  eventId: string,
) {
  const events = await db
    .select()
    .from(schema.sentryEvents)
    .where(
      and(
        eq(schema.sentryEvents.id, eventId),
        eq(schema.sentryEvents.projectId, projectId),
      ),
    )
    .limit(1);

  return events[0] || null;
}

export async function listSentryIssues(
  db: DB,
  projectId: string,
  options: { status?: string; limit?: number },
) {
  const conditions = [eq(schema.sentryIssues.projectId, projectId)];

  if (options.status) {
    conditions.push(eq(schema.sentryIssues.status, options.status));
  }

  return db
    .select()
    .from(schema.sentryIssues)
    .where(and(...conditions))
    .orderBy(desc(schema.sentryIssues.lastSeenAt))
    .limit(options.limit || 50);
}

export async function getSentryIssue(
  db: DB,
  projectId: string,
  issueId: string,
) {
  const issues = await db
    .select()
    .from(schema.sentryIssues)
    .where(
      and(
        eq(schema.sentryIssues.id, issueId),
        eq(schema.sentryIssues.projectId, projectId),
      ),
    )
    .limit(1);

  return issues[0] || null;
}

export async function updateSentryIssue(
  db: DB,
  projectId: string,
  issueId: string,
  updates: { status?: string },
) {
  const issue = await getSentryIssue(db, projectId, issueId);
  if (!issue) return null;

  await db
    .update(schema.sentryIssues)
    .set(updates)
    .where(
      and(
        eq(schema.sentryIssues.id, issueId),
        eq(schema.sentryIssues.projectId, projectId),
      ),
    );

  return getSentryIssue(db, projectId, issueId);
}
