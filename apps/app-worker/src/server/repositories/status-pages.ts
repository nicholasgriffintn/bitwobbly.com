import type { KVNamespace } from "@cloudflare/workers-types";
import { schema, nowIso, randomId } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { listOpenIncidents } from "./incidents.js";

export async function listStatusPages(db: DrizzleD1Database, teamId: string) {
  return await db
    .select()
    .from(schema.statusPages)
    .where(eq(schema.statusPages.teamId, teamId))
    .orderBy(schema.statusPages.createdAt);
}

export async function createStatusPage(
  db: DrizzleD1Database,
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

export async function getStatusPageById(
  db: DrizzleD1Database,
  teamId: string,
  id: string,
) {
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
  db: DrizzleD1Database,
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

export async function deleteStatusPage(
  db: DrizzleD1Database,
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
  db: DrizzleD1Database,
  statusPageId: string,
) {
  const rows = await db
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
    .where(eq(schema.statusPageComponents.statusPageId, statusPageId))
    .orderBy(schema.statusPageComponents.sortOrder);
  return rows || [];
}

export async function rebuildStatusSnapshot(
  db: DrizzleD1Database,
  kv: KVNamespace,
  teamId: string,
  slug: string,
) {
  const page = await getStatusPageBySlug(db, teamId, slug);
  if (!page) return null;

  const components = await listComponentsForStatusPage(db, page.id);
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

  const incidents = await listOpenIncidents(db, teamId, page.id);

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
