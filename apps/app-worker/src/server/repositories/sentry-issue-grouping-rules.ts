import { nowIso, randomId, schema, type DB } from "@bitwobbly/shared";
import { and, desc, eq } from "drizzle-orm";

export type IssueGroupingMatchers = NonNullable<
  (typeof schema.sentryIssueGroupingRules)["$inferInsert"]["matchers"]
>;

export async function listSentryIssueGroupingRules(db: DB, projectId: string) {
  return db
    .select()
    .from(schema.sentryIssueGroupingRules)
    .where(eq(schema.sentryIssueGroupingRules.projectId, projectId))
    .orderBy(desc(schema.sentryIssueGroupingRules.createdAt))
    .limit(200);
}

export async function createSentryIssueGroupingRule(
  db: DB,
  projectId: string,
  data: {
    name: string;
    enabled?: boolean;
    matchers?: IssueGroupingMatchers | null;
    fingerprint: string;
  }
) {
  const id = randomId("igr");
  await db.insert(schema.sentryIssueGroupingRules).values({
    id,
    projectId,
    name: data.name,
    enabled: data.enabled === false ? 0 : 1,
    matchers: data.matchers ?? null,
    fingerprint: data.fingerprint,
    createdAt: nowIso(),
  });

  const rules = await db
    .select()
    .from(schema.sentryIssueGroupingRules)
    .where(
      and(
        eq(schema.sentryIssueGroupingRules.id, id),
        eq(schema.sentryIssueGroupingRules.projectId, projectId)
      )
    )
    .limit(1);

  return rules[0] || null;
}

export async function updateSentryIssueGroupingRule(
  db: DB,
  projectId: string,
  ruleId: string,
  updates: {
    name?: string;
    enabled?: boolean;
    matchers?: IssueGroupingMatchers | null;
    fingerprint?: string;
  }
) {
  await db
    .update(schema.sentryIssueGroupingRules)
    .set({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.enabled !== undefined
        ? { enabled: updates.enabled ? 1 : 0 }
        : {}),
      ...(updates.matchers !== undefined ? { matchers: updates.matchers } : {}),
      ...(updates.fingerprint !== undefined
        ? { fingerprint: updates.fingerprint }
        : {}),
    })
    .where(
      and(
        eq(schema.sentryIssueGroupingRules.id, ruleId),
        eq(schema.sentryIssueGroupingRules.projectId, projectId)
      )
    );

  const rules = await db
    .select()
    .from(schema.sentryIssueGroupingRules)
    .where(
      and(
        eq(schema.sentryIssueGroupingRules.id, ruleId),
        eq(schema.sentryIssueGroupingRules.projectId, projectId)
      )
    )
    .limit(1);

  return rules[0] || null;
}

export async function deleteSentryIssueGroupingRule(
  db: DB,
  projectId: string,
  ruleId: string
) {
  const existing = await db
    .select({ id: schema.sentryIssueGroupingRules.id })
    .from(schema.sentryIssueGroupingRules)
    .where(
      and(
        eq(schema.sentryIssueGroupingRules.id, ruleId),
        eq(schema.sentryIssueGroupingRules.projectId, projectId)
      )
    )
    .limit(1);
  if (!existing[0]) return false;

  await db
    .delete(schema.sentryIssueGroupingRules)
    .where(
      and(
        eq(schema.sentryIssueGroupingRules.id, ruleId),
        eq(schema.sentryIssueGroupingRules.projectId, projectId)
      )
    );

  return true;
}
