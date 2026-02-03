import { schema, nowIso } from "@bitwobbly/shared";
import { eq } from "drizzle-orm";

import type { DB } from '../lib/db';

export async function getMonitorState(db: DB, monitorId: string) {
  const states = await db
    .select()
    .from(schema.monitorState)
    .where(eq(schema.monitorState.monitorId, monitorId))
    .limit(1);

  return states[0];
}

export async function upsertMonitorState(
  db: DB,
  monitorId: string,
  data: {
    lastCheckedAt: number;
    lastStatus: 'up' | 'down' | 'unknown';
    lastLatencyMs: number | null;
    consecutiveFailures: number;
    lastError: string | null;
  },
) {
  await db
    .insert(schema.monitorState)
    .values({
      monitorId,
      lastCheckedAt: data.lastCheckedAt,
      lastStatus: data.lastStatus,
      lastLatencyMs: data.lastLatencyMs,
      consecutiveFailures: data.consecutiveFailures,
      lastError: data.lastError,
      incidentOpen: 0,
      updatedAt: nowIso(),
    })
    .onConflictDoUpdate({
      target: schema.monitorState.monitorId,
      set: {
        lastCheckedAt: data.lastCheckedAt,
        lastStatus: data.lastStatus,
        lastLatencyMs: data.lastLatencyMs,
        consecutiveFailures: data.consecutiveFailures,
        lastError: data.lastError,
        updatedAt: nowIso(),
      },
    });
}
