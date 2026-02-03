import { schema, nowIso, randomId, type DB } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";

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
  const existingInTeam = await db
    .select({ id: schema.statusPages.id })
    .from(schema.statusPages)
    .where(
      and(eq(schema.statusPages.teamId, teamId), eq(schema.statusPages.slug, input.slug)),
    )
    .limit(1);

  if (existingInTeam.length) {
    throw new Error("Status page slug is already in use");
  }

  const existing = await db
    .select({ id: schema.statusPages.id })
    .from(schema.statusPages)
    .where(and(eq(schema.statusPages.slug, input.slug), eq(schema.statusPages.isPublic, 1)))
    .limit(1);

  if (existing.length) {
    throw new Error("Status page slug is already in use");
  }

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

export async function getPublicStatusPageBySlug(db: DB, slug: string) {
  const rows = await db
    .select()
    .from(schema.statusPages)
    .where(and(eq(schema.statusPages.slug, slug), eq(schema.statusPages.isPublic, 1)))
    .limit(2);

  if (rows.length !== 1) return null;
  return rows[0];
}

export async function publicStatusPageExistsBySlug(db: DB, slug: string) {
  const page = await db
    .select({ id: schema.statusPages.id })
    .from(schema.statusPages)
    .where(
      and(eq(schema.statusPages.slug, slug), eq(schema.statusPages.isPublic, 1)),
    )
    .limit(2);

  return page.length === 1;
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
  if (input.slug !== undefined) {
    const existingInTeam = await db
      .select({ id: schema.statusPages.id })
      .from(schema.statusPages)
      .where(
        and(
          eq(schema.statusPages.teamId, teamId),
          eq(schema.statusPages.slug, input.slug),
        ),
      )
      .limit(1);

    if (existingInTeam.length && existingInTeam[0].id !== statusPageId) {
      throw new Error("Status page slug is already in use");
    }

    const existing = await db
      .select({ id: schema.statusPages.id })
      .from(schema.statusPages)
      .where(
        and(eq(schema.statusPages.slug, input.slug), eq(schema.statusPages.isPublic, 1)),
      )
      .limit(1);

    if (existing.length && existing[0].id !== statusPageId) {
      throw new Error("Status page slug is already in use");
    }
  }

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
