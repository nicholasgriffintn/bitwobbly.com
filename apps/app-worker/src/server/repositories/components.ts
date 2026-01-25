import { schema, nowIso, randomId, type DB } from "@bitwobbly/shared";
import { eq, and, inArray } from "drizzle-orm";

export async function listComponents(db: DB, teamId: string) {
  const components = await db
    .select()
    .from(schema.components)
    .where(eq(schema.components.teamId, teamId))
    .orderBy(schema.components.createdAt);

  if (!components.length) return [];

  const ids = components.map((c) => c.id);
  const links = ids.length
    ? await db
        .select()
        .from(schema.componentMonitors)
        .where(inArray(schema.componentMonitors.componentId, ids))
    : [];

  const monitorLinks = new Map<string, string[]>();
  for (const link of links) {
    const arr = monitorLinks.get(link.componentId) || [];
    arr.push(link.monitorId);
    monitorLinks.set(link.componentId, arr);
  }

  return components.map((c) => ({
    ...c,
    monitorIds: monitorLinks.get(c.id) || [],
  }));
}

export async function createComponent(
  db: DB,
  teamId: string,
  input: { name: string; description?: string },
) {
  const id = randomId("cmp");
  await db.insert(schema.components).values({
    id,
    teamId,
    name: input.name,
    description: input.description || null,
    createdAt: nowIso(),
  });
  return { id };
}

export async function updateComponent(
  db: DB,
  teamId: string,
  componentId: string,
  input: { name?: string; description?: string | null },
) {
  await db
    .update(schema.components)
    .set(input)
    .where(
      and(
        eq(schema.components.teamId, teamId),
        eq(schema.components.id, componentId),
      ),
    );
}

export async function deleteComponent(
  db: DB,
  teamId: string,
  componentId: string,
) {
  await db
    .delete(schema.componentMonitors)
    .where(eq(schema.componentMonitors.componentId, componentId));
  await db
    .delete(schema.statusPageComponents)
    .where(eq(schema.statusPageComponents.componentId, componentId));
  await db
    .delete(schema.components)
    .where(
      and(
        eq(schema.components.teamId, teamId),
        eq(schema.components.id, componentId),
      ),
    );
}

export async function linkMonitorToComponent(
  db: DB,
  componentId: string,
  monitorId: string,
) {
  await db
    .insert(schema.componentMonitors)
    .values({ componentId, monitorId })
    .onConflictDoNothing();
}

export async function unlinkMonitorFromComponent(
  db: DB,
  componentId: string,
  monitorId: string,
) {
  await db
    .delete(schema.componentMonitors)
    .where(
      and(
        eq(schema.componentMonitors.componentId, componentId),
        eq(schema.componentMonitors.monitorId, monitorId),
      ),
    );
}

export async function linkComponentToStatusPage(
  db: DB,
  statusPageId: string,
  componentId: string,
  sortOrder: number = 0,
) {
  await db
    .insert(schema.statusPageComponents)
    .values({ statusPageId, componentId, sortOrder })
    .onConflictDoNothing();
}

export async function unlinkComponentFromStatusPage(
  db: DB,
  statusPageId: string,
  componentId: string,
) {
  await db
    .delete(schema.statusPageComponents)
    .where(
      and(
        eq(schema.statusPageComponents.statusPageId, statusPageId),
        eq(schema.statusPageComponents.componentId, componentId),
      ),
    );
}

export async function getComponentsForStatusPage(db: DB, statusPageId: string) {
  const rows = await db
    .select({
      componentId: schema.statusPageComponents.componentId,
      sortOrder: schema.statusPageComponents.sortOrder,
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
  return rows;
}
