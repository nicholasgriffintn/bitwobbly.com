import { schema, nowIso, randomId } from "@bitwobbly/shared";
import { eq, inArray, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export async function listMonitors(db: DrizzleD1Database, teamId: string) {
  const monitors = await db
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.teamId, teamId))
    .orderBy(schema.monitors.createdAt);

  if (!monitors.length) return [];

  const ids = monitors.map((m) => m.id);
  const states = ids.length
    ? await db
        .select()
        .from(schema.monitorState)
        .where(inArray(schema.monitorState.monitorId, ids))
    : [];
  const stateMap = new Map(states.map((s) => [s.monitorId, s]));

  return monitors.map((m) => ({
    ...m,
    state: stateMap.get(m.id) || null,
  }));
}

export async function createMonitor(
  db: DrizzleD1Database,
  teamId: string,
  input: {
    name: string;
    url: string;
    interval_seconds: number;
    timeout_ms: number;
    failure_threshold: number;
  },
) {
  const id = randomId("mon");
  const created_at = nowIso();
  const next_run_at = Math.floor(Date.now() / 1000);

  await db.insert(schema.monitors).values({
    id,
    teamId,
    name: input.name,
    url: input.url,
    method: "GET",
    timeoutMs: input.timeout_ms,
    intervalSeconds: input.interval_seconds,
    failureThreshold: input.failure_threshold,
    enabled: 1,
    nextRunAt: next_run_at,
    createdAt: created_at,
  });

  await db
    .insert(schema.monitorState)
    .values({
      monitorId: id,
      lastCheckedAt: 0,
      lastStatus: "unknown",
      lastLatencyMs: null,
      consecutiveFailures: 0,
      lastError: null,
      incidentOpen: 0,
      updatedAt: nowIso(),
    })
    .onConflictDoNothing();

  return { id };
}

export async function deleteMonitor(
  db: DrizzleD1Database,
  teamId: string,
  monitorId: string,
) {
  await db
    .delete(schema.monitors)
    .where(
      and(
        eq(schema.monitors.teamId, teamId),
        eq(schema.monitors.id, monitorId),
      ),
    );
  await db
    .delete(schema.monitorState)
    .where(eq(schema.monitorState.monitorId, monitorId));
}

export async function monitorExists(
  db: DrizzleD1Database,
  teamId: string,
  monitorId: string,
): Promise<boolean> {
  const monitor = await db
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(
      and(
        eq(schema.monitors.teamId, teamId),
        eq(schema.monitors.id, monitorId),
      ),
    )
    .limit(1);

  return monitor.length > 0;
}

export async function getMonitorById(
  db: DrizzleD1Database,
  teamId: string,
  monitorId: string,
) {
  const monitors = await db
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(
      and(
        eq(schema.monitors.teamId, teamId),
        eq(schema.monitors.id, monitorId),
      ),
    )
    .limit(1);

  return monitors[0] || null;
}

export async function updateMonitor(
  db: DrizzleD1Database,
  teamId: string,
  monitorId: string,
  input: {
    name?: string;
    url?: string;
    interval_seconds?: number;
    timeout_ms?: number;
    failure_threshold?: number;
    enabled?: number;
  },
) {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.url !== undefined) updates.url = input.url;
  if (input.interval_seconds !== undefined)
    updates.intervalSeconds = input.interval_seconds;
  if (input.timeout_ms !== undefined) updates.timeoutMs = input.timeout_ms;
  if (input.failure_threshold !== undefined)
    updates.failureThreshold = input.failure_threshold;
  if (input.enabled !== undefined) updates.enabled = input.enabled;

  if (Object.keys(updates).length === 0) return;

  await db
    .update(schema.monitors)
    .set(updates)
    .where(
      and(
        eq(schema.monitors.teamId, teamId),
        eq(schema.monitors.id, monitorId),
      ),
    );
}
