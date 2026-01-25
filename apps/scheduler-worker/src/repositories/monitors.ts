import { schema } from "@bitwobbly/shared";
import { eq, and, lte, inArray, or } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export async function getDueMonitors(
  db: DrizzleD1Database,
  teamId: string,
  nowSec: number,
  limit: number,
) {
  return await db
    .select({
      id: schema.monitors.id,
      name: schema.monitors.name,
      teamId: schema.monitors.teamId,
      url: schema.monitors.url,
      type: schema.monitors.type,
      timeoutMs: schema.monitors.timeoutMs,
      intervalSeconds: schema.monitors.intervalSeconds,
      failureThreshold: schema.monitors.failureThreshold,
      externalConfig: schema.monitors.externalConfig,
    })
    .from(schema.monitors)
    .where(
      and(
        eq(schema.monitors.teamId, teamId),
        eq(schema.monitors.enabled, 1),
        lte(schema.monitors.nextRunAt, nowSec),
        lte(schema.monitors.lockedUntil, nowSec),
        or(
          eq(schema.monitors.type, "http"),
          eq(schema.monitors.type, "external"),
        ),
      ),
    )
    .limit(limit);
}

export async function claimMonitor(
  db: DrizzleD1Database,
  monitorId: string,
  nowSec: number,
  lockUntil: number,
) {
  return await db
    .update(schema.monitors)
    .set({ lockedUntil: lockUntil })
    .where(
      and(
        eq(schema.monitors.id, monitorId),
        eq(schema.monitors.enabled, 1),
        lte(schema.monitors.nextRunAt, nowSec),
        lte(schema.monitors.lockedUntil, nowSec),
      ),
    )
    .run();
}

export async function updateMonitorNextRun(
  db: DrizzleD1Database,
  monitorId: string,
  nextRunAt: number,
  lockUntil: number,
) {
  return await db
    .update(schema.monitors)
    .set({
      nextRunAt,
      lockedUntil: 0,
    })
    .where(
      and(
        eq(schema.monitors.id, monitorId),
        eq(schema.monitors.lockedUntil, lockUntil),
      ),
    )
    .run();
}

export async function unlockMonitor(
  db: DrizzleD1Database,
  monitorId: string,
  lockUntil: number,
) {
  return await db
    .update(schema.monitors)
    .set({ lockedUntil: 0 })
    .where(
      and(
        eq(schema.monitors.id, monitorId),
        eq(schema.monitors.lockedUntil, lockUntil),
      ),
    )
    .run();
}
