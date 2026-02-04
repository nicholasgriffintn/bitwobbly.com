import { nowIso, createDb, schema } from "@bitwobbly/shared";
import { eq, and, ne, inArray, desc } from "drizzle-orm";

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
  },
) {
  const db = createDb(env.DB);

  const components = await db
    .select({
      id: schema.components.id,
      name: schema.components.name,
      description: schema.components.description,
    })
    .from(schema.statusPageComponents)
    .innerJoin(
      schema.components,
      eq(schema.components.id, schema.statusPageComponents.componentId),
    )
    .where(eq(schema.statusPageComponents.statusPageId, page.id))
    .orderBy(schema.statusPageComponents.sortOrder);

  const compsWithStatus = [];
  for (const c of components) {
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

    let status: "up" | "down" | "unknown" = "unknown";
    if (monitorRows.length)
      status = monitorRows.some((r) => r.lastStatus === "down") ? "down" : "up";

    compsWithStatus.push({ ...c, status });
  }

  const openIncidents = await db
    .select()
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.teamId, page.teamId),
        eq(schema.incidents.statusPageId, page.id),
        ne(schema.incidents.status, "resolved"),
      ),
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
        eq(schema.incidents.status, "resolved"),
      ),
    )
    .orderBy(desc(schema.incidents.startedAt))
    .limit(50);

  const recentResolvedIncidents = resolvedIncidents.filter(
    (i) => (i.resolvedAt || 0) >= cutoffTimestamp,
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
  reason?: string,
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
  incidentId: string,
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
