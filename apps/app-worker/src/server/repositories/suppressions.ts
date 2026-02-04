import { and, eq, inArray, lte, gt, or, isNull } from "drizzle-orm";
import { nowIso, randomId, schema, type DB } from "@bitwobbly/shared";

export type SuppressionScopeType = "monitor" | "monitor_group" | "component";
export type SuppressionKind = "maintenance" | "silence";

export type SuppressionWithScopes = schema.Suppression & {
  scopes: Array<{ scopeType: string; scopeId: string }>;
};

export async function listSuppressions(
  db: DB,
  teamId: string
): Promise<SuppressionWithScopes[]> {
  const suppressions = await db
    .select()
    .from(schema.suppressions)
    .where(eq(schema.suppressions.teamId, teamId))
    .orderBy(schema.suppressions.startsAt);

  if (!suppressions.length) return [];

  const ids = suppressions.map((s) => s.id);
  const scopes = await db
    .select({
      suppressionId: schema.suppressionScopes.suppressionId,
      scopeType: schema.suppressionScopes.scopeType,
      scopeId: schema.suppressionScopes.scopeId,
    })
    .from(schema.suppressionScopes)
    .where(inArray(schema.suppressionScopes.suppressionId, ids));

  const byId = new Map<string, Array<{ scopeType: string; scopeId: string }>>();
  for (const s of scopes) {
    const arr = byId.get(s.suppressionId) || [];
    arr.push({ scopeType: s.scopeType, scopeId: s.scopeId });
    byId.set(s.suppressionId, arr);
  }

  return suppressions.map((s) => ({
    ...s,
    scopes: byId.get(s.id) || [],
  }));
}

export async function createSuppression(
  db: DB,
  teamId: string,
  input: {
    kind: SuppressionKind;
    name: string;
    reason?: string;
    startsAt: number;
    endsAt?: number | null;
    scopes: Array<{ scopeType: SuppressionScopeType; scopeId: string }>;
  }
) {
  const id = randomId("sup");
  await db.insert(schema.suppressions).values({
    id,
    teamId,
    kind: input.kind,
    name: input.name,
    reason: input.reason || null,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    createdAt: nowIso(),
  });

  if (input.scopes.length) {
    await db.insert(schema.suppressionScopes).values(
      input.scopes.map((s) => ({
        suppressionId: id,
        scopeType: s.scopeType,
        scopeId: s.scopeId,
      }))
    );
  }

  return { id };
}

export async function deleteSuppression(db: DB, teamId: string, id: string) {
  await db
    .delete(schema.suppressions)
    .where(
      and(
        eq(schema.suppressions.teamId, teamId),
        eq(schema.suppressions.id, id)
      )
    );
}

export async function listActiveSuppressionMatches(
  db: DB,
  teamId: string,
  nowSec: number,
  input: {
    kinds?: SuppressionKind[];
    monitors?: string[];
    monitorGroups?: string[];
    components?: string[];
  }
): Promise<
  Array<{
    id: string;
    kind: string;
    name: string;
    reason: string | null;
    scopeType: string;
    scopeId: string;
  }>
> {
  const wantedKinds = input.kinds?.length
    ? input.kinds
    : ["maintenance", "silence"];
  const anyIds =
    (input.monitors?.length || 0) +
    (input.monitorGroups?.length || 0) +
    (input.components?.length || 0);
  if (!anyIds) return [];

  const scopePredicates = [];
  if (input.monitors?.length) {
    scopePredicates.push(
      and(
        eq(schema.suppressionScopes.scopeType, "monitor"),
        inArray(schema.suppressionScopes.scopeId, input.monitors)
      )
    );
  }
  if (input.monitorGroups?.length) {
    scopePredicates.push(
      and(
        eq(schema.suppressionScopes.scopeType, "monitor_group"),
        inArray(schema.suppressionScopes.scopeId, input.monitorGroups)
      )
    );
  }
  if (input.components?.length) {
    scopePredicates.push(
      and(
        eq(schema.suppressionScopes.scopeType, "component"),
        inArray(schema.suppressionScopes.scopeId, input.components)
      )
    );
  }

  return db
    .select({
      id: schema.suppressions.id,
      kind: schema.suppressions.kind,
      name: schema.suppressions.name,
      reason: schema.suppressions.reason,
      scopeType: schema.suppressionScopes.scopeType,
      scopeId: schema.suppressionScopes.scopeId,
    })
    .from(schema.suppressions)
    .innerJoin(
      schema.suppressionScopes,
      eq(schema.suppressionScopes.suppressionId, schema.suppressions.id)
    )
    .where(
      and(
        eq(schema.suppressions.teamId, teamId),
        inArray(schema.suppressions.kind, wantedKinds),
        lte(schema.suppressions.startsAt, nowSec),
        or(
          isNull(schema.suppressions.endsAt),
          gt(schema.suppressions.endsAt, nowSec)
        ),
        or(...scopePredicates)
      )
    );
}
