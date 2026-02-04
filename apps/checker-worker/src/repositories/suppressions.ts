import { and, eq, inArray, lte, gt, or, isNull } from "drizzle-orm";
import { schema } from "@bitwobbly/shared";

import type { DB } from "../lib/db";

export type MonitorSuppressionState = {
  isMaintenance: boolean;
  isSilenced: boolean;
  matched?: { id: string; kind: string; name: string; reason: string | null };
};

export async function getMonitorSuppressionState(
  db: DB,
  teamId: string,
  monitorId: string,
  nowSec: number
): Promise<MonitorSuppressionState> {
  const monitor = await db
    .select({ groupId: schema.monitors.groupId })
    .from(schema.monitors)
    .where(
      and(eq(schema.monitors.teamId, teamId), eq(schema.monitors.id, monitorId))
    )
    .limit(1);

  const groupId = monitor[0]?.groupId ?? null;

  const componentRows = await db
    .select({ componentId: schema.components.id })
    .from(schema.componentMonitors)
    .innerJoin(
      schema.components,
      eq(schema.components.id, schema.componentMonitors.componentId)
    )
    .where(
      and(
        eq(schema.componentMonitors.monitorId, monitorId),
        eq(schema.components.teamId, teamId)
      )
    );

  const componentIds = componentRows.map((r) => r.componentId);

  const scopePredicates = [
    and(
      eq(schema.suppressionScopes.scopeType, "monitor"),
      eq(schema.suppressionScopes.scopeId, monitorId)
    ),
  ];
  if (groupId) {
    scopePredicates.push(
      and(
        eq(schema.suppressionScopes.scopeType, "monitor_group"),
        eq(schema.suppressionScopes.scopeId, groupId)
      )
    );
  }
  if (componentIds.length) {
    scopePredicates.push(
      and(
        eq(schema.suppressionScopes.scopeType, "component"),
        inArray(schema.suppressionScopes.scopeId, componentIds)
      )
    );
  }

  const matches = await db
    .select({
      id: schema.suppressions.id,
      kind: schema.suppressions.kind,
      name: schema.suppressions.name,
      reason: schema.suppressions.reason,
    })
    .from(schema.suppressions)
    .innerJoin(
      schema.suppressionScopes,
      eq(schema.suppressionScopes.suppressionId, schema.suppressions.id)
    )
    .where(
      and(
        eq(schema.suppressions.teamId, teamId),
        lte(schema.suppressions.startsAt, nowSec),
        or(
          isNull(schema.suppressions.endsAt),
          gt(schema.suppressions.endsAt, nowSec)
        ),
        or(...scopePredicates)
      )
    );

  const maintenance = matches.find((m) => m.kind === "maintenance") || null;
  const silence = matches.find((m) => m.kind === "silence") || null;

  if (maintenance) {
    return { isMaintenance: true, isSilenced: true, matched: maintenance };
  }
  if (silence) {
    return { isMaintenance: false, isSilenced: true, matched: silence };
  }
  return { isMaintenance: false, isSilenced: false };
}
