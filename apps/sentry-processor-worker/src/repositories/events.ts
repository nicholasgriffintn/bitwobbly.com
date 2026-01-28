import { schema, nowIso, randomId } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";
import type { DB } from "../lib/db";

export interface UpsertIssueResult {
  issueId: string;
  isNewIssue: boolean;
  wasResolved: boolean;
}

export async function upsertIssue(
  db: DB,
  projectId: string,
  data: {
    fingerprint: string;
    title: string;
    level: string;
    culprit?: string | null;
  },
): Promise<UpsertIssueResult> {
  const existing = await db
    .select()
    .from(schema.sentryIssues)
    .where(
      and(
        eq(schema.sentryIssues.projectId, projectId),
        eq(schema.sentryIssues.fingerprint, data.fingerprint),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const wasResolved =
      existing[0].status === "resolved" || existing[0].status === "ignored";
    const now = Math.floor(Date.now() / 1000);

    const updates: Record<string, unknown> = {
      lastSeenAt: now,
      eventCount: existing[0].eventCount + 1,
    };

    if (wasResolved) {
      updates.status = "unresolved";
      updates.resolvedAt = null;
    }

    await db
      .update(schema.sentryIssues)
      .set(updates)
      .where(eq(schema.sentryIssues.id, existing[0].id));

    return {
      issueId: existing[0].id,
      isNewIssue: false,
      wasResolved,
    };
  }

  const id = randomId("iss");
  const now = Math.floor(Date.now() / 1000);

  await db.insert(schema.sentryIssues).values({
    id,
    projectId,
    fingerprint: data.fingerprint,
    title: data.title,
    culprit: data.culprit || null,
    level: data.level,
    status: "unresolved",
    eventCount: 1,
    userCount: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    resolvedAt: null,
    createdAt: nowIso(),
  });

  return {
    issueId: id,
    isNewIssue: true,
    wasResolved: false,
  };
}

export async function insertEvent(
  db: DB,
  data: {
    id: string;
    projectId: string;
    issueId: string;
    type: string;
    level: string | null;
    message: string | null;
    fingerprint: string;
    release: string | null;
    environment: string | null;
    r2Key: string;
    receivedAt: number;
    user?: {
      id?: string;
      username?: string;
      email?: string;
      ip_address?: string;
    } | null;
    tags?: Record<string, string> | null;
    contexts?: {
      device?: { [key: string]: {} };
      os?: { [key: string]: {} };
      runtime?: { [key: string]: {} };
      browser?: { [key: string]: {} };
      app?: { [key: string]: {} };
    } | null;
    request?: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      data?: {};
    } | null;
    exception?: {
      values?: Array<{
        type?: string;
        value?: string;
        mechanism?: { [key: string]: {} };
        stacktrace?: { [key: string]: {} };
      }>;
    } | null;
    breadcrumbs?: Array<{
      timestamp?: string;
      type?: string;
      category?: string;
      message?: string;
      level?: string;
      data?: { [key: string]: {} };
    }> | null;
  },
) {
  await db.insert(schema.sentryEvents).values({
    ...data,
    createdAt: nowIso(),
  });
}
