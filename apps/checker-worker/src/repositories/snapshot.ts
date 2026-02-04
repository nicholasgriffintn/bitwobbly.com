import { nowIso, createDb, schema } from "@bitwobbly/shared";
import { eq, and, ne, inArray, desc, lte, gt, or, isNull } from "drizzle-orm";

export async function rebuildAllSnapshots(env: {
  DB: D1Database;
  KV: KVNamespace;
}) {
  const db = createDb(env.DB);
  const pages = await db
    .select({
      id: schema.statusPages.id,
      slug: schema.statusPages.slug,
      name: schema.statusPages.name,
      teamId: schema.statusPages.teamId,
      logoUrl: schema.statusPages.logoUrl,
      brandColor: schema.statusPages.brandColor,
      customCss: schema.statusPages.customCss,
    })
    .from(schema.statusPages)
    .where(inArray(schema.statusPages.accessMode, ["public", "private"]));

  for (const p of pages) {
    await rebuildStatusSnapshot(env, p);
  }
}

async function rebuildStatusSnapshot(
  env: { DB: D1Database; KV: KVNamespace },
  page: {
    id: string;
    slug: string;
    name: string;
    teamId: string;
    logoUrl: string | null;
    brandColor: string | null;
    customCss: string | null;
  }
) {
  const db = createDb(env.DB);

  const components = await db
    .select({
      id: schema.components.id,
      name: schema.components.name,
      description: schema.components.description,
      currentStatus: schema.components.currentStatus,
    })
    .from(schema.statusPageComponents)
    .innerJoin(
      schema.components,
      eq(schema.components.id, schema.statusPageComponents.componentId)
    )
    .where(eq(schema.statusPageComponents.statusPageId, page.id))
    .orderBy(schema.statusPageComponents.sortOrder);

  const nowSec = Math.floor(Date.now() / 1000);
  const componentIds = components.map((c) => c.id);
  const componentMonitorLinks = componentIds.length
    ? await db
        .select({
          componentId: schema.componentMonitors.componentId,
          monitorId: schema.componentMonitors.monitorId,
        })
        .from(schema.componentMonitors)
        .where(inArray(schema.componentMonitors.componentId, componentIds))
    : [];

  const monitorIds = Array.from(
    new Set(componentMonitorLinks.map((l) => l.monitorId))
  );
  const monitors = monitorIds.length
    ? await db
        .select({ id: schema.monitors.id, groupId: schema.monitors.groupId })
        .from(schema.monitors)
        .where(inArray(schema.monitors.id, monitorIds))
    : [];

  const monitorGroupIds = Array.from(
    new Set(monitors.map((m) => m.groupId).filter((id): id is string => !!id))
  );

  const maintenanceMatches =
    componentIds.length || monitorIds.length || monitorGroupIds.length
      ? await db
          .select({
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
              eq(schema.suppressions.teamId, page.teamId),
              eq(schema.suppressions.kind, "maintenance"),
              lte(schema.suppressions.startsAt, nowSec),
              or(
                isNull(schema.suppressions.endsAt),
                gt(schema.suppressions.endsAt, nowSec)
              ),
              or(
                and(
                  eq(schema.suppressionScopes.scopeType, "component"),
                  inArray(schema.suppressionScopes.scopeId, componentIds)
                ),
                and(
                  eq(schema.suppressionScopes.scopeType, "monitor"),
                  inArray(schema.suppressionScopes.scopeId, monitorIds)
                ),
                monitorGroupIds.length
                  ? and(
                      eq(schema.suppressionScopes.scopeType, "monitor_group"),
                      inArray(schema.suppressionScopes.scopeId, monitorGroupIds)
                    )
                  : and(
                      eq(schema.suppressionScopes.scopeType, "monitor_group"),
                      inArray(schema.suppressionScopes.scopeId, ["__none__"])
                    )
              )
            )
          )
      : [];

  const maintenanceMonitorIds = new Set(
    maintenanceMatches
      .filter((m) => m.scopeType === "monitor")
      .map((m) => m.scopeId)
  );
  const maintenanceGroupIds = new Set(
    maintenanceMatches
      .filter((m) => m.scopeType === "monitor_group")
      .map((m) => m.scopeId)
  );
  const maintenanceComponentIds = new Set(
    maintenanceMatches
      .filter((m) => m.scopeType === "component")
      .map((m) => m.scopeId)
  );

  const monitorIdToGroupId = new Map(monitors.map((m) => [m.id, m.groupId]));
  const componentIdToMonitorIds = new Map<string, string[]>();
  for (const link of componentMonitorLinks) {
    const arr = componentIdToMonitorIds.get(link.componentId) || [];
    arr.push(link.monitorId);
    componentIdToMonitorIds.set(link.componentId, arr);
  }

  const monitorStates = monitorIds.length
    ? await db
        .select({
          monitorId: schema.monitorState.monitorId,
          lastStatus: schema.monitorState.lastStatus,
        })
        .from(schema.monitorState)
        .where(inArray(schema.monitorState.monitorId, monitorIds))
    : [];
  const monitorIdToStatus = new Map(
    monitorStates.map((s) => [s.monitorId, s.lastStatus])
  );

  const dependencyRows = componentIds.length
    ? await db
        .select({
          componentId: schema.componentDependencies.componentId,
          dependsOnComponentId:
            schema.componentDependencies.dependsOnComponentId,
        })
        .from(schema.componentDependencies)
        .where(inArray(schema.componentDependencies.componentId, componentIds))
    : [];

  const componentIdToDependencyIds = new Map<string, string[]>();
  for (const row of dependencyRows) {
    const arr = componentIdToDependencyIds.get(row.componentId) || [];
    arr.push(row.dependsOnComponentId);
    componentIdToDependencyIds.set(row.componentId, arr);
  }

  const compsWithStatus = [];
  for (const c of components) {
    let status: "up" | "down" | "unknown" | "maintenance" = "unknown";

    if (c.currentStatus && c.currentStatus !== "operational") {
      status = c.currentStatus === "maintenance" ? "maintenance" : "down";
    } else {
      const linkedMonitorIds = componentIdToMonitorIds.get(c.id) || [];
      const isInMaintenance =
        maintenanceComponentIds.has(c.id) ||
        linkedMonitorIds.some((id) => maintenanceMonitorIds.has(id)) ||
        linkedMonitorIds.some((id) => {
          const groupId = monitorIdToGroupId.get(id);
          return groupId ? maintenanceGroupIds.has(groupId) : false;
        });

      if (isInMaintenance) {
        status = "maintenance";
      } else if (linkedMonitorIds.length) {
        const statuses = linkedMonitorIds
          .map((id) => monitorIdToStatus.get(id) || "unknown")
          .filter((s): s is string => typeof s === "string");

        const hasDown = statuses.some((s) => s === "down");
        const hasUp = statuses.some((s) => s === "up");
        status = hasDown ? "down" : hasUp ? "up" : "unknown";
      }
    }

    compsWithStatus.push({
      id: c.id,
      name: c.name,
      description: c.description,
      status,
    });
  }

  const severity: Record<"up" | "unknown" | "maintenance" | "down", number> = {
    up: 0,
    unknown: 1,
    maintenance: 2,
    down: 3,
  };
  const statusById = new Map<string, "up" | "unknown" | "maintenance" | "down">(
    compsWithStatus.map((c: any) => [c.id, c.status])
  );

  for (let i = 0; i < componentIds.length; i++) {
    let changed = false;
    for (const c of compsWithStatus as any[]) {
      const base = statusById.get(c.id) || "unknown";
      if (base === "down" || base === "maintenance") continue;

      const depIds = componentIdToDependencyIds.get(c.id) || [];
      if (!depIds.length) continue;

      let next: "up" | "unknown" | "maintenance" | "down" = base;
      for (const depId of depIds) {
        const depStatus = statusById.get(depId) || "unknown";
        if (severity[depStatus] > severity[next]) next = depStatus;
      }
      if (next !== base) {
        statusById.set(c.id, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const c of compsWithStatus as any[]) {
    c.status = statusById.get(c.id) || c.status;
  }

  const openIncidents = await db
    .select()
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.teamId, page.teamId),
        eq(schema.incidents.statusPageId, page.id),
        ne(schema.incidents.status, "resolved")
      )
    )
    .orderBy(schema.incidents.startedAt);

  const cutoffTimestamp = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const resolvedIncidents = await db
    .select()
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.teamId, page.teamId),
        eq(schema.incidents.statusPageId, page.id),
        eq(schema.incidents.status, "resolved")
      )
    )
    .orderBy(desc(schema.incidents.startedAt))
    .limit(50);

  const recentResolvedIncidents = resolvedIncidents.filter(
    (i) => (i.resolvedAt || 0) >= cutoffTimestamp
  );

  const incidents = [...openIncidents, ...recentResolvedIncidents];

  const incIds = incidents.map((i) => i.id);
  const updates = incIds.length
    ? await db
        .select()
        .from(schema.incidentUpdates)
        .where(inArray(schema.incidentUpdates.incidentId, incIds))
        .orderBy(schema.incidentUpdates.createdAt)
    : [];

  const byId = new Map<string, typeof updates>();
  for (const u of updates) {
    const arr = byId.get(u.incidentId) || [];
    arr.push(u);
    byId.set(u.incidentId, arr);
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    page: {
      id: page.id,
      name: page.name,
      slug: page.slug,
      logo_url: page.logoUrl,
      brand_color: page.brandColor,
      custom_css: page.customCss,
    },
    components: compsWithStatus,
    incidents: incidents.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      started_at: i.startedAt,
      resolved_at: i.resolvedAt,
      updates: (byId.get(i.id) || []).map((u) => ({
        id: u.id,
        message: u.message,
        status: u.status,
        created_at: u.createdAt,
      })),
    })),
  };

  await env.KV.put(`status:public:${page.slug}`, JSON.stringify(snapshot), {
    expirationTtl: 60,
  });
}

export async function openIncident(
  env: { DB: D1Database },
  teamId: string,
  monitorId: string,
  reason?: string
) {
  const db = createDb(env.DB);
  const incidentId = `inc_${crypto.randomUUID()}`;
  const startedAt = Math.floor(Date.now() / 1000);

  await db.insert(schema.incidents).values({
    id: incidentId,
    teamId,
    statusPageId: null,
    monitorId,
    title: "Monitor down",
    status: "investigating",
    startedAt,
    resolvedAt: null,
    createdAt: nowIso(),
  });

  await db.insert(schema.incidentUpdates).values({
    id: `up_${crypto.randomUUID()}`,
    incidentId,
    message: reason || "Automated monitoring detected an outage.",
    status: "investigating",
    createdAt: nowIso(),
  });

  await db
    .update(schema.monitorState)
    .set({
      incidentOpen: 1,
      updatedAt: nowIso(),
    })
    .where(eq(schema.monitorState.monitorId, monitorId));

  return incidentId;
}

export async function resolveIncident(
  env: { DB: D1Database },
  monitorId: string,
  incidentId: string
) {
  const db = createDb(env.DB);
  const resolvedAt = Math.floor(Date.now() / 1000);

  await db
    .update(schema.incidents)
    .set({
      status: "resolved",
      resolvedAt,
    })
    .where(eq(schema.incidents.id, incidentId));

  await db.insert(schema.incidentUpdates).values({
    id: `up_${crypto.randomUUID()}`,
    incidentId,
    message: "Service has recovered.",
    status: "resolved",
    createdAt: nowIso(),
  });

  await db
    .update(schema.monitorState)
    .set({
      incidentOpen: 0,
      updatedAt: nowIso(),
    })
    .where(eq(schema.monitorState.monitorId, monitorId));
}
