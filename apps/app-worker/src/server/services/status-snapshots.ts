import type { DB } from "@bitwobbly/shared";
import { schema } from "@bitwobbly/shared";
import { inArray } from "drizzle-orm";

import {
  getExternalStatusPageBySlug,
  getStatusPageById,
  getStatusPageBySlug,
  listComponentsForStatusPage,
  listStatusPages,
} from "../repositories/status-pages";
import {
  listOpenIncidents,
  listRecentResolvedIncidents,
} from "../repositories/incidents";
import { getComponentHistoricalData, type DayStatus } from "../lib/status-history";
import {
  getPublicStatusSnapshotCacheKey,
  getTeamStatusSnapshotCacheKey,
} from "../lib/status-snapshot-cache";
import { listActiveSuppressionMatches } from "../repositories/suppressions";

type ComponentStatus = {
  id: string;
  name: string;
  description: string | null;
  status: "up" | "down" | "unknown" | "maintenance";
  historical_data?: DayStatus[];
  overall_uptime?: number;
};

type IncidentUpdate = {
  id: string;
  message: string;
  status: string;
  created_at: string;
};

type Incident = {
  id: string;
  title: string;
  status: string;
  started_at: number;
  resolved_at: number | null;
  updates: IncidentUpdate[];
};

export type StatusSnapshot = {
  generated_at: string;
  page: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    brand_color: string | null;
    custom_css: string | null;
  };
  components: ComponentStatus[];
  incidents: Incident[];
};

function computeOverallUptime(days: DayStatus[] | undefined): number | undefined {
  if (!days) return undefined;

  const knownDays = days.filter((d) => d.status !== "unknown");
  if (!knownDays.length) return 100;

  const total = knownDays.reduce((sum, d) => sum + d.uptimePercentage, 0);
  return total / knownDays.length;
}

export async function rebuildStatusSnapshot(
  db: DB,
  kv: KVNamespace,
  slug: string,
  accountId?: string,
  apiToken?: string,
  options?: { teamId?: string; includePrivate?: boolean },
): Promise<StatusSnapshot | null> {
  const page = options?.teamId
    ? await getStatusPageBySlug(db, options.teamId, slug)
    : await getExternalStatusPageBySlug(db, slug);

  if (!page) return null;

  const components = await listComponentsForStatusPage(db, page.id);
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
    new Set(componentMonitorLinks.map((l) => l.monitorId)),
  );
  const monitors = monitorIds.length
    ? await db
        .select({
          id: schema.monitors.id,
          groupId: schema.monitors.groupId,
        })
        .from(schema.monitors)
        .where(inArray(schema.monitors.id, monitorIds))
    : [];

  const monitorGroupIds = Array.from(
    new Set(monitors.map((m) => m.groupId).filter((id): id is string => !!id)),
  );
  const maintenanceMatches = await listActiveSuppressionMatches(
    db,
    page.teamId,
    nowSec,
    {
      kinds: ["maintenance"],
      monitors: monitorIds,
      monitorGroups: monitorGroupIds,
      components: componentIds,
    },
  );

  const maintenanceMonitorIds = new Set(
    maintenanceMatches
      .filter((m) => m.scopeType === "monitor")
      .map((m) => m.scopeId),
  );
  const maintenanceGroupIds = new Set(
    maintenanceMatches
      .filter((m) => m.scopeType === "monitor_group")
      .map((m) => m.scopeId),
  );
  const maintenanceComponentIds = new Set(
    maintenanceMatches
      .filter((m) => m.scopeType === "component")
      .map((m) => m.scopeId),
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
    monitorStates.map((s) => [s.monitorId, s.lastStatus]),
  );

  const dependencyRows = componentIds.length
    ? await db
        .select({
          componentId: schema.componentDependencies.componentId,
          dependsOnComponentId: schema.componentDependencies.dependsOnComponentId,
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

  const compsWithStatus: ComponentStatus[] = [];

  for (const component of components) {
    let status: "up" | "down" | "unknown" | "maintenance" = "unknown";

    if (component.currentStatus && component.currentStatus !== "operational") {
      status = component.currentStatus === "maintenance" ? "maintenance" : "down";
    } else {
      const linkedMonitorIds = componentIdToMonitorIds.get(component.id) || [];

      const isInMaintenance =
        maintenanceComponentIds.has(component.id) ||
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

    let historicalData: DayStatus[] | undefined;
    if (accountId && apiToken) {
      const ids = componentIdToMonitorIds.get(component.id) || [];
      historicalData = await getComponentHistoricalData(
        accountId,
        apiToken,
        ids,
        90,
      );
    }

    compsWithStatus.push({
      id: component.id,
      name: component.name,
      description: component.description,
      status,
      historical_data: historicalData,
      overall_uptime: computeOverallUptime(historicalData),
    });
  }

  const severity: Record<ComponentStatus["status"], number> = {
    up: 0,
    unknown: 1,
    maintenance: 2,
    down: 3,
  };

  const statusById = new Map(compsWithStatus.map((c) => [c.id, c.status]));
  for (let i = 0; i < components.length; i++) {
    let changed = false;
    for (const c of compsWithStatus) {
      const base = statusById.get(c.id) || "unknown";
      if (base === "down" || base === "maintenance") continue;

      const depIds = componentIdToDependencyIds.get(c.id) || [];
      if (!depIds.length) continue;

      let next: ComponentStatus["status"] = base;
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

  for (const c of compsWithStatus) {
    c.status = statusById.get(c.id) || c.status;
  }

  const openIncidents = await listOpenIncidents(db, page.teamId, page.id);
  const pastIncidents = await listRecentResolvedIncidents(
    db,
    page.teamId,
    page.id,
    30,
  );
  const allIncidents = [...openIncidents, ...pastIncidents];

  const snapshot: StatusSnapshot = {
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
    incidents: allIncidents.map((incident) => ({
      id: incident.id,
      title: incident.title,
      status: incident.status,
      started_at: incident.startedAt,
      resolved_at: incident.resolvedAt,
      updates: (incident.updates || []).map((update) => ({
        id: update.id,
        message: update.message,
        status: update.status,
        created_at: update.createdAt,
      })),
    })),
  };

  const cacheKey =
    options?.teamId
      ? getTeamStatusSnapshotCacheKey(options.teamId, slug)
      : getPublicStatusSnapshotCacheKey(slug);

  await kv.put(cacheKey, JSON.stringify(snapshot), { expirationTtl: 60 });
  return snapshot;
}

export async function clearStatusPageCache(
  db: DB,
  kv: KVNamespace,
  teamId: string,
  statusPageId: string,
) {
  const page = await getStatusPageById(db, teamId, statusPageId);
  if (!page) return;

  await kv.delete(getTeamStatusSnapshotCacheKey(teamId, page.slug));
  if (page.accessMode !== "internal") {
    await kv.delete(getPublicStatusSnapshotCacheKey(page.slug));
  }
}

export async function clearAllStatusPageCaches(
  db: DB,
  kv: KVNamespace,
  teamId: string,
) {
  const pages = await listStatusPages(db, teamId);
  for (const page of pages) {
    await kv.delete(getTeamStatusSnapshotCacheKey(teamId, page.slug));
    if (page.accessMode !== "internal") {
      await kv.delete(getPublicStatusSnapshotCacheKey(page.slug));
    }
  }
}
