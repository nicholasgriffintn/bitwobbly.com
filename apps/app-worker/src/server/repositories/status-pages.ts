import { schema, nowIso, randomId, type DB } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";

import { listOpenIncidents, listRecentResolvedIncidents } from "./incidents.js";

interface DayStatus {
  date: string;
  status: "operational" | "degraded" | "down" | "unknown";
  uptimePercentage: number;
}

async function getComponentHistoricalData(
  accountId: string,
  apiToken: string,
  monitorIds: string[],
  days: number,
): Promise<DayStatus[]> {
  if (monitorIds.length === 0) {
    const result: DayStatus[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      result.push({
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        status: "operational",
        uptimePercentage: 100,
      });
    }
    return result;
  }

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
  const startTimestamp = Math.floor(startTime.getTime() / 1000);
  const endTimestamp = Math.floor(endTime.getTime() / 1000);

  const monitorIdsClause = monitorIds
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(", ");

  const query = `
    SELECT
      blob3 as status,
      timestamp
    FROM "bitwobbly-monitor-analytics"
    WHERE blob2 IN (${monitorIdsClause})
      AND timestamp >= toDateTime(${startTimestamp})
      AND timestamp <= toDateTime(${endTimestamp})
    ORDER BY timestamp ASC
  `;

  const API = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;
  const response = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: query,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `Analytics Engine query failed (${response.status}):`,
      errorText,
    );
    const result: DayStatus[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      result.push({
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        status: "unknown",
        uptimePercentage: 0,
      });
    }
    return result;
  }

  const responseJSON = (await response.json()) as {
    data?: Array<{
      status: string;
      timestamp: number | string;
    }>;
  };
  const rawData = responseJSON.data || [];

  const dayBuckets = new Map<
    string,
    { up_count: number; down_count: number }
  >();

  for (const row of rawData) {
    const ts =
      typeof row.timestamp === "string"
        ? new Date(row.timestamp).getTime()
        : row.timestamp * 1000;
    const date = new Date(ts);
    const dayKey = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    if (!dayBuckets.has(dayKey)) {
      dayBuckets.set(dayKey, { up_count: 0, down_count: 0 });
    }

    const bucket = dayBuckets.get(dayKey)!;
    if (row.status === "up") {
      bucket.up_count++;
    } else if (row.status === "down") {
      bucket.down_count++;
    }
  }

  const result: DayStatus[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayKey = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    const bucket = dayBuckets.get(dayKey);
    if (bucket) {
      const total = bucket.up_count + bucket.down_count;
      const uptimePercentage =
        total > 0 ? (bucket.up_count / total) * 100 : 100;
      let status: "operational" | "degraded" | "down" = "operational";
      if (uptimePercentage < 50) {
        status = "down";
      } else if (uptimePercentage < 99) {
        status = "degraded";
      }
      result.push({
        date: dayKey,
        status,
        uptimePercentage,
      });
    } else {
      result.push({
        date: dayKey,
        status: "unknown",
        uptimePercentage: 100,
      });
    }
  }

  return result;
}

export async function listStatusPages(db: DB, teamId: string) {
  return await db
    .select()
    .from(schema.statusPages)
    .where(eq(schema.statusPages.teamId, teamId))
    .orderBy(schema.statusPages.createdAt);
}

export async function createStatusPage(
  db: DB,
  teamId: string,
  input: {
    name: string;
    slug: string;
    logo_url?: string;
    brand_color?: string;
    custom_css?: string;
  },
) {
  const id = randomId("sp");
  await db.insert(schema.statusPages).values({
    id,
    teamId,
    slug: input.slug,
    name: input.name,
    isPublic: 1,
    logoUrl: input.logo_url || null,
    brandColor: input.brand_color || "#007bff",
    customCss: input.custom_css || null,
    createdAt: nowIso(),
  });
  return { id };
}

export async function getStatusPageById(db: DB, teamId: string, id: string) {
  const rows = await db
    .select()
    .from(schema.statusPages)
    .where(
      and(eq(schema.statusPages.teamId, teamId), eq(schema.statusPages.id, id)),
    )
    .limit(1);
  return rows[0] || null;
}

export async function getStatusPageBySlug(
  db: DB,
  teamId: string,
  slug: string,
) {
  const rows = await db
    .select()
    .from(schema.statusPages)
    .where(
      and(
        eq(schema.statusPages.teamId, teamId),
        eq(schema.statusPages.slug, slug),
      ),
    )
    .limit(1);
  return rows[0] || null;
}

export async function updateStatusPage(
  db: DB,
  teamId: string,
  statusPageId: string,
  input: {
    name?: string;
    slug?: string;
    logo_url?: string | null;
    brand_color?: string;
    custom_css?: string | null;
  },
) {
  const updates: Record<string, string | null> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.logo_url !== undefined) updates.logoUrl = input.logo_url;
  if (input.brand_color !== undefined) updates.brandColor = input.brand_color;
  if (input.custom_css !== undefined) updates.customCss = input.custom_css;

  await db
    .update(schema.statusPages)
    .set(updates)
    .where(
      and(
        eq(schema.statusPages.teamId, teamId),
        eq(schema.statusPages.id, statusPageId),
      ),
    );
}

export async function deleteStatusPage(
  db: DB,
  teamId: string,
  statusPageId: string,
) {
  await db
    .delete(schema.statusPageComponents)
    .where(eq(schema.statusPageComponents.statusPageId, statusPageId));
  await db
    .delete(schema.statusPages)
    .where(
      and(
        eq(schema.statusPages.teamId, teamId),
        eq(schema.statusPages.id, statusPageId),
      ),
    );
}

export async function listComponentsForStatusPage(
  db: DB,
  statusPageId: string,
) {
  const rows = await db
    .select({
      id: schema.components.id,
      name: schema.components.name,
      description: schema.components.description,
      currentStatus: schema.components.currentStatus,
    })
    .from(schema.statusPageComponents)
    .innerJoin(
      schema.components,
      eq(schema.components.id, schema.statusPageComponents.componentId),
    )
    .where(eq(schema.statusPageComponents.statusPageId, statusPageId))
    .orderBy(schema.statusPageComponents.sortOrder);
  return rows || [];
}

type ComponentStatus = {
  id: string;
  name: string;
  description: string | null;
  status: 'up' | 'down' | 'unknown';
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

export async function rebuildStatusSnapshot(
  db: DB,
  kv: KVNamespace,
  slug: string,
  accountId?: string,
  apiToken?: string,
): Promise<StatusSnapshot | null> {
  const pageRows = await db
    .select()
    .from(schema.statusPages)
    .where(eq(schema.statusPages.slug, slug))
    .limit(1);

  const page = pageRows[0];
  if (!page) return null;

  const teamId = page.teamId;

  const components = await listComponentsForStatusPage(db, page.id);
  const compsWithStatus = [];

  for (const c of components) {
    let status: 'up' | 'down' | 'unknown' = 'unknown';

    if (c.currentStatus && c.currentStatus !== 'operational') {
      status = 'down';
    } else {
      const monitorRows = await db
        .select({
          lastStatus: schema.monitorState.lastStatus,
        })
        .from(schema.componentMonitors)
        .innerJoin(
          schema.monitorState,
          eq(schema.monitorState.monitorId, schema.componentMonitors.monitorId),
        )
        .where(eq(schema.componentMonitors.componentId, c.id));

      if (monitorRows.length) {
        status = monitorRows.some((r) => r.lastStatus === 'down')
          ? 'down'
          : 'up';
      }
    }

    let historicalData: DayStatus[] | undefined;
    let overallUptime = 100;

    if (accountId && apiToken) {
      const monitorIds = await db
        .select({
          monitorId: schema.componentMonitors.monitorId,
        })
        .from(schema.componentMonitors)
        .where(eq(schema.componentMonitors.componentId, c.id));

      const ids = monitorIds.map((m) => m.monitorId);
      historicalData = await getComponentHistoricalData(
        accountId,
        apiToken,
        ids,
        90,
      );

      const totalDays = historicalData.filter(
        (d) => d.status !== 'unknown',
      ).length;
      if (totalDays > 0) {
        const totalUptime = historicalData
          .filter((d) => d.status !== 'unknown')
          .reduce((sum, d) => sum + d.uptimePercentage, 0);
        overallUptime = totalUptime / totalDays;
      }
    }

    compsWithStatus.push({
      ...c,
      status,
      historical_data: historicalData,
      overall_uptime: overallUptime,
    });
  }

  const openIncidents = await listOpenIncidents(db, teamId, page.id);
  const pastIncidents = await listRecentResolvedIncidents(
    db,
    teamId,
    page.id,
    30,
  );
  const allIncidents = [...openIncidents, ...pastIncidents];

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
    incidents: allIncidents.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      started_at: i.startedAt,
      resolved_at: i.resolvedAt,
      updates: (i.updates || []).map((update) => {
        return {
          id: update.id,
          message: update.message,
          status: update.status,
          created_at: update.createdAt,
        };
      }),
    })),
  };

  await kv.put(`status:${slug}`, JSON.stringify(snapshot), {
    expirationTtl: 60,
  });
  return snapshot;
}

export async function clearStatusPageCache(
  db: DB,
  kv: KVNamespace,
  teamId: string,
  statusPageId: string,
) {
  const page = await getStatusPageById(db, teamId, statusPageId);
  if (page) {
    await kv.delete(`status:${page.slug}`);
  }
}

export async function clearAllStatusPageCaches(
  db: DB,
  kv: KVNamespace,
  teamId: string,
) {
  const pages = await listStatusPages(db, teamId);
  for (const page of pages) {
    await kv.delete(`status:${page.slug}`);
  }
}
