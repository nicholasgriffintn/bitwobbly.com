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

  const deps = ids.length
    ? await db
        .select({
          componentId: schema.componentDependencies.componentId,
          dependsOnComponentId: schema.componentDependencies.dependsOnComponentId,
        })
        .from(schema.componentDependencies)
        .where(inArray(schema.componentDependencies.componentId, ids))
    : [];

  const depLinks = new Map<string, string[]>();
  for (const d of deps) {
    const arr = depLinks.get(d.componentId) || [];
    arr.push(d.dependsOnComponentId);
    depLinks.set(d.componentId, arr);
  }

  return components.map((c) => ({
    ...c,
    monitorIds: monitorLinks.get(c.id) || [],
    dependencyIds: depLinks.get(c.id) || [],
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
    .delete(schema.componentDependencies)
    .where(eq(schema.componentDependencies.componentId, componentId));
  await db
    .delete(schema.componentDependencies)
    .where(eq(schema.componentDependencies.dependsOnComponentId, componentId));
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

export async function getComponentById(
  db: DB,
  teamId: string,
  componentId: string,
) {
  const components = await db
    .select()
    .from(schema.components)
    .where(
      and(
        eq(schema.components.teamId, teamId),
        eq(schema.components.id, componentId),
      ),
    )
    .limit(1);

  return components[0] || null;
}

export async function listComponentMonitorIds(db: DB, componentId: string) {
  const rows = await db
    .select({ monitorId: schema.componentMonitors.monitorId })
    .from(schema.componentMonitors)
    .where(eq(schema.componentMonitors.componentId, componentId));
  return rows.map((row) => row.monitorId);
}

export async function listComponentMonitorStates(db: DB, componentId: string) {
  return db
    .select({
      lastStatus: schema.monitorState.lastStatus,
    })
    .from(schema.componentMonitors)
    .innerJoin(
      schema.monitorState,
      eq(schema.monitorState.monitorId, schema.componentMonitors.monitorId),
    )
    .where(eq(schema.componentMonitors.componentId, componentId));
}

export async function linkMonitorToComponent(
  db: DB,
  teamId: string,
  componentId: string,
  monitorId: string,
) {
  const component = await getComponentById(db, teamId, componentId);
  if (!component) {
    throw new Error("Component not found or access denied");
  }

  const monitor = await db
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(
      and(
        eq(schema.monitors.teamId, teamId),
        eq(schema.monitors.id, monitorId),
      ),
    )
    .limit(1);

  if (!monitor.length) {
    throw new Error("Monitor not found or access denied");
  }

  await db
    .insert(schema.componentMonitors)
    .values({ componentId, monitorId })
    .onConflictDoNothing();
}

export async function unlinkMonitorFromComponent(
  db: DB,
  teamId: string,
  componentId: string,
  monitorId: string,
) {
  const component = await getComponentById(db, teamId, componentId);
  if (!component) {
    throw new Error("Component not found or access denied");
  }

  const monitor = await db
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(
      and(
        eq(schema.monitors.teamId, teamId),
        eq(schema.monitors.id, monitorId),
      ),
    )
    .limit(1);

  if (!monitor.length) {
    throw new Error("Monitor not found or access denied");
  }

  await db
    .delete(schema.componentMonitors)
    .where(
      and(
        eq(schema.componentMonitors.componentId, componentId),
        eq(schema.componentMonitors.monitorId, monitorId),
      ),
    );
}

export async function linkDependency(
  db: DB,
  teamId: string,
  componentId: string,
  dependsOnComponentId: string,
) {
  if (componentId === dependsOnComponentId) {
    throw new Error("A component cannot depend on itself");
  }

  const component = await getComponentById(db, teamId, componentId);
  if (!component) throw new Error("Component not found or access denied");

  const dependency = await getComponentById(db, teamId, dependsOnComponentId);
  if (!dependency) throw new Error("Dependency component not found or access denied");

  await db
    .insert(schema.componentDependencies)
    .values({ componentId, dependsOnComponentId })
    .onConflictDoNothing();
}

export async function unlinkDependency(
  db: DB,
  teamId: string,
  componentId: string,
  dependsOnComponentId: string,
) {
  const component = await getComponentById(db, teamId, componentId);
  if (!component) throw new Error("Component not found or access denied");

  const dependency = await getComponentById(db, teamId, dependsOnComponentId);
  if (!dependency) throw new Error("Dependency component not found or access denied");

  await db
    .delete(schema.componentDependencies)
    .where(
      and(
        eq(schema.componentDependencies.componentId, componentId),
        eq(schema.componentDependencies.dependsOnComponentId, dependsOnComponentId),
      ),
    );
}

export async function listComponentDependencies(db: DB, componentIds: string[]) {
  if (!componentIds.length) return new Map<string, string[]>();
  const rows = await db
    .select({
      componentId: schema.componentDependencies.componentId,
      dependsOnComponentId: schema.componentDependencies.dependsOnComponentId,
    })
    .from(schema.componentDependencies)
    .where(inArray(schema.componentDependencies.componentId, componentIds));

  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.componentId) || [];
    arr.push(r.dependsOnComponentId);
    map.set(r.componentId, arr);
  }
  return map;
}

export async function linkComponentToStatusPage(
  db: DB,
  teamId: string,
  statusPageId: string,
  componentId: string,
  sortOrder: number = 0,
) {
  const statusPage = await db
    .select({ id: schema.statusPages.id })
    .from(schema.statusPages)
    .where(
      and(
        eq(schema.statusPages.teamId, teamId),
        eq(schema.statusPages.id, statusPageId),
      ),
    )
    .limit(1);

  if (!statusPage.length) {
    throw new Error("Status page not found or access denied");
  }

  const component = await getComponentById(db, teamId, componentId);
  if (!component) {
    throw new Error("Component not found or access denied");
  }

  await db
    .insert(schema.statusPageComponents)
    .values({ statusPageId, componentId, sortOrder })
    .onConflictDoNothing();
}

export async function unlinkComponentFromStatusPage(
  db: DB,
  teamId: string,
  statusPageId: string,
  componentId: string,
) {
  const statusPage = await db
    .select({ id: schema.statusPages.id })
    .from(schema.statusPages)
    .where(
      and(
        eq(schema.statusPages.teamId, teamId),
        eq(schema.statusPages.id, statusPageId),
      ),
    )
    .limit(1);

  if (!statusPage.length) {
    throw new Error("Status page not found or access denied");
  }

  const component = await getComponentById(db, teamId, componentId);
  if (!component) {
    throw new Error("Component not found or access denied");
  }

  await db
    .delete(schema.statusPageComponents)
    .where(
      and(
        eq(schema.statusPageComponents.statusPageId, statusPageId),
        eq(schema.statusPageComponents.componentId, componentId),
      ),
    );
}

export async function getComponentsForStatusPage(
  db: DB,
  teamId: string,
  statusPageId: string,
) {
  const statusPage = await db
    .select({ id: schema.statusPages.id })
    .from(schema.statusPages)
    .where(
      and(
        eq(schema.statusPages.teamId, teamId),
        eq(schema.statusPages.id, statusPageId),
      ),
    )
    .limit(1);

  if (!statusPage.length) {
    throw new Error("Status page not found or access denied");
  }

  const rows = await db
    .select({
      componentId: schema.statusPageComponents.componentId,
      sortOrder: schema.statusPageComponents.sortOrder,
      name: schema.components.name,
      description: schema.components.description,
      currentStatus: schema.components.currentStatus,
      statusUpdatedAt: schema.components.statusUpdatedAt,
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

export async function updateComponentStatus(
  db: DB,
  teamId: string,
  componentId: string,
  status: string,
) {
  const statusUpdatedAt = Math.floor(Date.now() / 1000);
  await db
    .update(schema.components)
    .set({
      currentStatus: status,
      statusUpdatedAt,
    })
    .where(
      and(
        eq(schema.components.teamId, teamId),
        eq(schema.components.id, componentId),
      ),
    );
}

export async function getComponentStatus(
  db: DB,
  teamId: string,
  componentId: string,
) {
  const component = await db
    .select({
      currentStatus: schema.components.currentStatus,
      statusUpdatedAt: schema.components.statusUpdatedAt,
    })
    .from(schema.components)
    .where(
      and(
        eq(schema.components.teamId, teamId),
        eq(schema.components.id, componentId),
      ),
    )
    .limit(1);

  return component[0] || null;
}
