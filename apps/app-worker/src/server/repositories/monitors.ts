import { schema, nowIso, randomId, type DB } from "@bitwobbly/shared";
import { eq, inArray, and } from "drizzle-orm";

type MonitorWithState = schema.Monitor & {
  state: schema.MonitorState | null;
};

async function assertMonitorGroupAccess(
  db: DB,
  teamId: string,
  groupId: string
) {
  const rows = await db
    .select({ id: schema.monitorGroups.id })
    .from(schema.monitorGroups)
    .where(
      and(
        eq(schema.monitorGroups.teamId, teamId),
        eq(schema.monitorGroups.id, groupId)
      )
    )
    .limit(1);
  if (!rows.length) throw new Error("Monitor group not found or access denied");
}

export async function listMonitors(
  db: DB,
  teamId: string
): Promise<MonitorWithState[]> {
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
  db: DB,
  teamId: string,
  input: {
    name: string;
    url?: string;
    group_id?: string | null;
    interval_seconds: number;
    timeout_ms: number;
    failure_threshold: number;
    type?: string;
    webhook_token?: string;
    external_config?: string;
  }
) {
  const id = randomId("mon");
  const created_at = nowIso();
  const next_run_at = Math.floor(Date.now() / 1000);

  if (input.group_id) {
    await assertMonitorGroupAccess(db, teamId, input.group_id);
  }

  await db.insert(schema.monitors).values({
    id,
    teamId,
    groupId: input.group_id || null,
    name: input.name,
    url: input.url || null,
    method: "GET",
    timeoutMs: input.timeout_ms,
    intervalSeconds: input.interval_seconds,
    failureThreshold: input.failure_threshold,
    enabled: 1,
    nextRunAt: next_run_at,
    type: input.type || "http",
    webhookToken: input.webhook_token || null,
    externalConfig: input.external_config || null,
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

  return { id, webhookToken: input.webhook_token };
}

export async function deleteMonitor(db: DB, teamId: string, monitorId: string) {
  await db
    .delete(schema.alertRules)
    .where(eq(schema.alertRules.monitorId, monitorId));

  await db
    .delete(schema.componentMonitors)
    .where(eq(schema.componentMonitors.monitorId, monitorId));

  await db
    .update(schema.incidents)
    .set({ monitorId: null })
    .where(eq(schema.incidents.monitorId, monitorId));

  await db
    .delete(schema.monitorState)
    .where(eq(schema.monitorState.monitorId, monitorId));

  await db
    .delete(schema.monitors)
    .where(
      and(eq(schema.monitors.teamId, teamId), eq(schema.monitors.id, monitorId))
    );
}

export async function monitorExists(
  db: DB,
  teamId: string,
  monitorId: string
): Promise<boolean> {
  const monitor = await db
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(
      and(eq(schema.monitors.teamId, teamId), eq(schema.monitors.id, monitorId))
    )
    .limit(1);

  return monitor.length > 0;
}

export async function getMonitorById(
  db: DB,
  teamId: string,
  monitorId: string
) {
  const monitors = await db
    .select()
    .from(schema.monitors)
    .where(
      and(eq(schema.monitors.teamId, teamId), eq(schema.monitors.id, monitorId))
    )
    .limit(1);

  return monitors[0] || null;
}

export async function updateMonitor(
  db: DB,
  teamId: string,
  monitorId: string,
  input: {
    name?: string;
    url?: string;
    group_id?: string | null;
    interval_seconds?: number;
    timeout_ms?: number;
    failure_threshold?: number;
    enabled?: number;
    type?: string;
    external_config?: string;
  }
) {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.url !== undefined) updates.url = input.url;
  if (input.group_id !== undefined) {
    if (input.group_id) {
      await assertMonitorGroupAccess(db, teamId, input.group_id);
    }
    updates.groupId = input.group_id;
  }
  if (input.interval_seconds !== undefined)
    updates.intervalSeconds = input.interval_seconds;
  if (input.timeout_ms !== undefined) updates.timeoutMs = input.timeout_ms;
  if (input.failure_threshold !== undefined)
    updates.failureThreshold = input.failure_threshold;
  if (input.enabled !== undefined) updates.enabled = input.enabled;
  if (input.type !== undefined) updates.type = input.type;
  if (input.external_config !== undefined)
    updates.externalConfig = input.external_config;

  if (Object.keys(updates).length === 0) return;

  await db
    .update(schema.monitors)
    .set(updates)
    .where(
      and(eq(schema.monitors.teamId, teamId), eq(schema.monitors.id, monitorId))
    );
}

export async function updateMonitorStatus(
  db: DB,
  teamId: string,
  monitorId: string,
  status: "up" | "down" | "degraded",
  message?: string
) {
  const monitor = await getMonitorById(db, teamId, monitorId);
  if (!monitor) {
    throw new Error("Monitor not found");
  }

  await db
    .update(schema.monitorState)
    .set({
      lastStatus: status,
      lastCheckedAt: Math.floor(Date.now() / 1000),
      lastError: message || null,
      updatedAt: nowIso(),
    })
    .where(eq(schema.monitorState.monitorId, monitorId));
}

export async function getMonitorByWebhookToken(
  db: DB,
  monitorId: string,
  tokenHash: string
) {
  const monitors = await db
    .select()
    .from(schema.monitors)
    .where(
      and(
        eq(schema.monitors.id, monitorId),
        eq(schema.monitors.webhookToken, tokenHash)
      )
    )
    .limit(1);

  return monitors[0] || null;
}

export async function getMonitorStateById(db: DB, monitorId: string) {
  const rows = await db
    .select()
    .from(schema.monitorState)
    .where(eq(schema.monitorState.monitorId, monitorId))
    .limit(1);

  return rows[0] || null;
}

export async function upsertMonitorStateFromStatusUpdate(
  db: DB,
  monitorId: string,
  input: {
    nowSec: number;
    status: "up" | "down" | "degraded";
    consecutiveFailures: number;
    lastError?: string | null;
  }
) {
  await db
    .insert(schema.monitorState)
    .values({
      monitorId,
      lastCheckedAt: input.nowSec,
      lastStatus: input.status,
      lastLatencyMs: null,
      consecutiveFailures: input.consecutiveFailures,
      lastError: input.lastError ?? null,
      incidentOpen: 0,
      updatedAt: nowIso(),
    })
    .onConflictDoUpdate({
      target: schema.monitorState.monitorId,
      set: {
        lastCheckedAt: input.nowSec,
        lastStatus: input.status,
        consecutiveFailures: input.consecutiveFailures,
        lastError: input.lastError ?? null,
        updatedAt: nowIso(),
      },
    });
}

export async function setMonitorIncidentOpen(
  db: DB,
  monitorId: string,
  open: boolean
) {
  await db
    .update(schema.monitorState)
    .set({
      incidentOpen: open ? 1 : 0,
      updatedAt: nowIso(),
    })
    .where(eq(schema.monitorState.monitorId, monitorId));
}
