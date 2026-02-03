import type { DB } from "@bitwobbly/shared";

import {
  getPublicStatusPageBySlug,
  getStatusPageById,
  getStatusPageBySlug,
  listComponentsForStatusPage,
  listStatusPages,
} from "../repositories/status-pages";
import {
  listComponentMonitorIds,
  listComponentMonitorStates,
} from "../repositories/components";
import {
  listOpenIncidents,
  listRecentResolvedIncidents,
} from "../repositories/incidents";
import { getComponentHistoricalData, type DayStatus } from "../lib/status-history";
import {
  getPublicStatusSnapshotCacheKey,
  getTeamStatusSnapshotCacheKey,
} from "../lib/status-snapshot-cache";

type ComponentStatus = {
  id: string;
  name: string;
  description: string | null;
  status: "up" | "down" | "unknown";
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
  const includePrivate = options?.includePrivate ?? false;

  const page = options?.teamId
    ? await getStatusPageBySlug(db, options.teamId, slug)
    : includePrivate
      ? null
      : await getPublicStatusPageBySlug(db, slug);

  if (!page) return null;

  const components = await listComponentsForStatusPage(db, page.id);
  const compsWithStatus: ComponentStatus[] = [];

  for (const component of components) {
    let status: "up" | "down" | "unknown" = "unknown";

    if (component.currentStatus && component.currentStatus !== "operational") {
      status = "down";
    } else {
      const monitorRows = await listComponentMonitorStates(db, component.id);
      if (monitorRows.length) {
        status = monitorRows.some((r) => r.lastStatus === "down") ? "down" : "up";
      }
    }

    let historicalData: DayStatus[] | undefined;
    if (accountId && apiToken) {
      const ids = await listComponentMonitorIds(db, component.id);
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
    options?.teamId && includePrivate
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
  if (page.isPublic === 1) {
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
    if (page.isPublic === 1) {
      await kv.delete(getPublicStatusSnapshotCacheKey(page.slug));
    }
  }
}

