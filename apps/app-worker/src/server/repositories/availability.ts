import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { schema, type DB } from "@bitwobbly/shared";

import { getComponentById } from "./components";
import { getMonitorById } from "./monitors";
import { getStatusPageById, listComponentsForStatusPage } from "./status-pages";

export type AvailabilityScopeType = "monitor" | "component" | "status_page";

export type AvailabilityScopeResolution = {
  scope: { type: AvailabilityScopeType; id: string; name: string };
  monitorIds: string[];
  monitorGroupIds: string[];
  componentIds: string[];
};

export type AvailabilityInterval = { start: number; end: number };

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function resolveComponentClosure(
  db: DB,
  teamId: string,
  rootComponentIds: string[],
): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [...rootComponentIds];

  const batchSize = 100;
  while (queue.length) {
    const batch: string[] = [];
    while (queue.length && batch.length < batchSize) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      batch.push(id);
    }

    if (!batch.length) continue;

    const deps = await db
      .select({
        dependsOnComponentId: schema.componentDependencies.dependsOnComponentId,
      })
      .from(schema.componentDependencies)
      .where(inArray(schema.componentDependencies.componentId, batch));

    const depIds = uniq(deps.map((d) => d.dependsOnComponentId));
    if (!depIds.length) continue;

    const allowed = await db
      .select({ id: schema.components.id })
      .from(schema.components)
      .where(
        and(
          eq(schema.components.teamId, teamId),
          inArray(schema.components.id, depIds),
        ),
      );

    for (const row of allowed) {
      if (!seen.has(row.id)) queue.push(row.id);
    }
  }

  return Array.from(seen);
}

export async function resolveAvailabilityScope(
  db: DB,
  teamId: string,
  input: { type: AvailabilityScopeType; id: string; includeDependencies?: boolean },
): Promise<AvailabilityScopeResolution> {
  const includeDependencies = input.includeDependencies ?? true;

  if (input.type === "monitor") {
    const monitor = await getMonitorById(db, teamId, input.id);
    if (!monitor) throw new Error("Monitor not found");

    const groupId = monitor.groupId ? [monitor.groupId] : [];
    return {
      scope: { type: "monitor", id: monitor.id, name: monitor.name },
      monitorIds: [monitor.id],
      monitorGroupIds: groupId,
      componentIds: [],
    };
  }

  if (input.type === "component") {
    const component = await getComponentById(db, teamId, input.id);
    if (!component) throw new Error("Component not found");

    const componentIds = includeDependencies
      ? await resolveComponentClosure(db, teamId, [component.id])
      : [component.id];

    const links = await db
      .select({
        componentId: schema.componentMonitors.componentId,
        monitorId: schema.componentMonitors.monitorId,
      })
      .from(schema.componentMonitors)
      .where(inArray(schema.componentMonitors.componentId, componentIds));

    const monitorIds = uniq(links.map((l) => l.monitorId));
    const monitors = monitorIds.length
      ? await db
          .select({ id: schema.monitors.id, groupId: schema.monitors.groupId })
          .from(schema.monitors)
          .where(and(eq(schema.monitors.teamId, teamId), inArray(schema.monitors.id, monitorIds)))
      : [];

    const monitorGroupIds = uniq(
      monitors.map((m) => m.groupId).filter((id): id is string => !!id),
    );

    return {
      scope: { type: "component", id: component.id, name: component.name },
      monitorIds,
      monitorGroupIds,
      componentIds,
    };
  }

  const page = await getStatusPageById(db, teamId, input.id);
  if (!page) throw new Error("Status page not found");

  const comps = await listComponentsForStatusPage(db, page.id);
  const rootIds = comps.map((c) => c.id);
  const componentIds =
    includeDependencies && rootIds.length
      ? await resolveComponentClosure(db, teamId, rootIds)
      : rootIds;

  const links = componentIds.length
    ? await db
        .select({
          monitorId: schema.componentMonitors.monitorId,
        })
        .from(schema.componentMonitors)
        .where(inArray(schema.componentMonitors.componentId, componentIds))
    : [];
  const monitorIds = uniq(links.map((l) => l.monitorId));

  const monitors = monitorIds.length
    ? await db
        .select({ id: schema.monitors.id, groupId: schema.monitors.groupId })
        .from(schema.monitors)
        .where(and(eq(schema.monitors.teamId, teamId), inArray(schema.monitors.id, monitorIds)))
    : [];

  const monitorGroupIds = uniq(
    monitors.map((m) => m.groupId).filter((id): id is string => !!id),
  );

  return {
    scope: { type: "status_page", id: page.id, name: page.name },
    monitorIds,
    monitorGroupIds,
    componentIds,
  };
}

export async function listIncidentIntervalsForMonitors(
  db: DB,
  teamId: string,
  monitorIds: string[],
  fromSec: number,
  toSec: number,
): Promise<AvailabilityInterval[]> {
  if (!monitorIds.length) return [];

  const rows = await db
    .select({
      startedAt: schema.incidents.startedAt,
      resolvedAt: schema.incidents.resolvedAt,
    })
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.teamId, teamId),
        inArray(schema.incidents.monitorId, monitorIds),
        lt(schema.incidents.startedAt, toSec),
        or(isNull(schema.incidents.resolvedAt), gt(schema.incidents.resolvedAt, fromSec)),
      ),
    );

  return rows.map((r) => ({
    start: Number(r.startedAt),
    end: r.resolvedAt === null ? toSec : Number(r.resolvedAt),
  }));
}

export async function listMaintenanceIntervalsForScope(
  db: DB,
  teamId: string,
  input: {
    componentIds: string[];
    monitorIds: string[];
    monitorGroupIds: string[];
    fromSec: number;
    toSec: number;
  },
): Promise<AvailabilityInterval[]> {
  const clauses = [];
  if (input.componentIds.length) {
    clauses.push(
      and(
        eq(schema.suppressionScopes.scopeType, "component"),
        inArray(schema.suppressionScopes.scopeId, input.componentIds),
      ),
    );
  }
  if (input.monitorIds.length) {
    clauses.push(
      and(
        eq(schema.suppressionScopes.scopeType, "monitor"),
        inArray(schema.suppressionScopes.scopeId, input.monitorIds),
      ),
    );
  }
  if (input.monitorGroupIds.length) {
    clauses.push(
      and(
        eq(schema.suppressionScopes.scopeType, "monitor_group"),
        inArray(schema.suppressionScopes.scopeId, input.monitorGroupIds),
      ),
    );
  }

  if (!clauses.length) return [];

  const rows = await db
    .select({
      startsAt: schema.suppressions.startsAt,
      endsAt: schema.suppressions.endsAt,
    })
    .from(schema.suppressions)
    .innerJoin(
      schema.suppressionScopes,
      eq(schema.suppressionScopes.suppressionId, schema.suppressions.id),
    )
    .where(
      and(
        eq(schema.suppressions.teamId, teamId),
        eq(schema.suppressions.kind, "maintenance"),
        lt(schema.suppressions.startsAt, input.toSec),
        or(isNull(schema.suppressions.endsAt), gt(schema.suppressions.endsAt, input.fromSec)),
        or(...clauses),
      ),
    );

  return rows.map((r) => ({
    start: Number(r.startsAt),
    end: r.endsAt === null ? input.toSec : Number(r.endsAt),
  }));
}
