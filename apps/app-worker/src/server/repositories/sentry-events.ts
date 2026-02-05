import { schema, type DB } from "@bitwobbly/shared";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

export async function listSentryEvents(
  db: DB,
  projectId: string,
  options: {
    since?: number;
    until?: number;
    type?: string;
    issueId?: string;
    release?: string;
    environment?: string;
    transaction?: string;
    query?: string;
    limit?: number;
  }
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
  if (options.issueId) {
    conditions.push(eq(schema.sentryEvents.issueId, options.issueId));
  }
  if (options.release) {
    conditions.push(eq(schema.sentryEvents.release, options.release));
  }
  if (options.environment) {
    conditions.push(eq(schema.sentryEvents.environment, options.environment));
  }
  if (options.transaction) {
    conditions.push(eq(schema.sentryEvents.transaction, options.transaction));
  }
  if (options.query) {
    const q = `%${options.query.toLowerCase()}%`;
    conditions.push(
      sql`(lower(coalesce(${schema.sentryEvents.message}, '')) like ${q} OR lower(coalesce(${schema.sentryEvents.transaction}, '')) like ${q})`
    );
  }

  return db
    .select()
    .from(schema.sentryEvents)
    .where(and(...conditions))
    .orderBy(desc(schema.sentryEvents.receivedAt))
    .limit(options.limit ?? 100);
}

export async function getSentryEvent(
  db: DB,
  projectId: string,
  eventId: string
) {
  const events = await db
    .select()
    .from(schema.sentryEvents)
    .where(
      and(
        eq(schema.sentryEvents.id, eventId),
        eq(schema.sentryEvents.projectId, projectId)
      )
    )
    .limit(1);

  return events[0] || null;
}

export async function listSentryIssues(
  db: DB,
  projectId: string,
  options: {
    status?: string;
    since?: number;
    until?: number;
    query?: string;
    release?: string;
    environment?: string;
    assignedToUserId?: string;
    unassigned?: boolean;
    includeSnoozed?: boolean;
    limit?: number;
  }
) {
  const conditions = [eq(schema.sentryIssues.projectId, projectId)];

  if (options.status) {
    conditions.push(eq(schema.sentryIssues.status, options.status));
  }
  if (options.since) {
    conditions.push(gte(schema.sentryIssues.lastSeenAt, options.since));
  }
  if (options.until) {
    conditions.push(lte(schema.sentryIssues.lastSeenAt, options.until));
  }
  if (options.release) {
    conditions.push(eq(schema.sentryIssues.lastSeenRelease, options.release));
  }
  if (options.environment) {
    conditions.push(
      eq(schema.sentryIssues.lastSeenEnvironment, options.environment)
    );
  }
  if (options.assignedToUserId) {
    conditions.push(
      eq(schema.sentryIssues.assignedToUserId, options.assignedToUserId)
    );
  }
  if (options.unassigned) {
    conditions.push(sql`${schema.sentryIssues.assignedToUserId} IS NULL`);
  }
  if (!options.includeSnoozed) {
    const now = Math.floor(Date.now() / 1000);
    conditions.push(
      sql`(${schema.sentryIssues.snoozedUntil} IS NULL OR ${schema.sentryIssues.snoozedUntil} <= ${now})`
    );
  }
  if (options.query) {
    const q = `%${options.query.toLowerCase()}%`;
    conditions.push(
      sql`(lower(${schema.sentryIssues.title}) like ${q} OR lower(coalesce(${schema.sentryIssues.culprit}, '')) like ${q})`
    );
  }
  conditions.push(sql`
    exists (
      select 1
      from sentry_events se
      where se.issue_id = ${schema.sentryIssues.id}
        and se.type != 'transaction'
    )
  `);

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
  issueId: string
) {
  const issues = await db
    .select()
    .from(schema.sentryIssues)
    .where(
      and(
        eq(schema.sentryIssues.id, issueId),
        eq(schema.sentryIssues.projectId, projectId)
      )
    )
    .limit(1);

  return issues[0] || null;
}

export async function updateSentryIssue(
  db: DB,
  projectId: string,
  issueId: string,
  updates: {
    status?: string;
    assignedToUserId?: string | null;
    snoozedUntil?: number | null;
    ignoredUntil?: number | null;
    resolvedInRelease?: string | null;
  }
) {
  const issue = await getSentryIssue(db, projectId, issueId);
  if (!issue) return null;

  const now = Math.floor(Date.now() / 1000);
  const nextUpdates: Record<string, unknown> = { ...updates };

  if ("assignedToUserId" in updates) {
    nextUpdates.assignedAt =
      updates.assignedToUserId && updates.assignedToUserId.length ? now : null;
  }

  if (updates.status === "resolved") {
    nextUpdates.resolvedAt = now;
  }

  if (updates.status === "unresolved") {
    nextUpdates.resolvedAt = null;
  }

  await db
    .update(schema.sentryIssues)
    .set(nextUpdates)
    .where(
      and(
        eq(schema.sentryIssues.id, issueId),
        eq(schema.sentryIssues.projectId, projectId)
      )
    );

  return getSentryIssue(db, projectId, issueId);
}
