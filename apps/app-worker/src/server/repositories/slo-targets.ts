import { and, eq } from "drizzle-orm";
import { nowIso, randomId, schema, type DB } from "@bitwobbly/shared";

export type SloScopeType = "team" | "monitor" | "component" | "status_page";

export type SloTarget = { targetPpm: number };

export type EffectiveSloTarget =
  | { source: "scope"; slo: SloTarget }
  | { source: "team_default"; slo: SloTarget }
  | { source: "none"; slo: null };

export async function getSloTarget(
  db: DB,
  teamId: string,
  scopeType: SloScopeType,
  scopeId: string
): Promise<SloTarget | null> {
  let rows: Array<{ targetPpm: number | null }> = [];
  try {
    rows = await db
      .select({ targetPpm: schema.sloTargets.targetPpm })
      .from(schema.sloTargets)
      .where(
        and(
          eq(schema.sloTargets.teamId, teamId),
          eq(schema.sloTargets.scopeType, scopeType),
          eq(schema.sloTargets.scopeId, scopeId)
        )
      )
      .limit(1);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.toLowerCase().includes("no such table") &&
      message.includes("slo_targets")
    ) {
      return null;
    }
    throw e;
  }

  const row = rows[0];
  if (!row) return null;
  return { targetPpm: Number(row.targetPpm) };
}

export async function getEffectiveSloTarget(
  db: DB,
  teamId: string,
  scopeType: Exclude<SloScopeType, "team">,
  scopeId: string
): Promise<EffectiveSloTarget> {
  const scoped = await getSloTarget(db, teamId, scopeType, scopeId);
  if (scoped) return { source: "scope", slo: scoped };

  const teamDefault = await getSloTarget(db, teamId, "team", teamId);
  if (teamDefault) return { source: "team_default", slo: teamDefault };

  return { source: "none", slo: null };
}

export async function upsertSloTarget(
  db: DB,
  teamId: string,
  scopeType: SloScopeType,
  scopeId: string,
  targetPpm: number
): Promise<void> {
  const now = nowIso();
  await db
    .insert(schema.sloTargets)
    .values({
      id: randomId("slo"),
      teamId,
      scopeType,
      scopeId,
      targetPpm,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.sloTargets.teamId,
        schema.sloTargets.scopeType,
        schema.sloTargets.scopeId,
      ],
      set: {
        targetPpm,
        updatedAt: nowIso(),
      },
    });
}
