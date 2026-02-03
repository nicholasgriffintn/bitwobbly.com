import { schema, nowIso, randomId, type DB } from "@bitwobbly/shared";
import { eq, and, ne, inArray, desc } from "drizzle-orm";

export async function listOpenIncidents(
  db: DB,
  teamId: string,
  statusPageId: string | null,
) {
  const whereClause = statusPageId
    ? and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.statusPageId, statusPageId),
        ne(schema.incidents.status, "resolved"),
      )
    : and(
        eq(schema.incidents.teamId, teamId),
        ne(schema.incidents.status, "resolved"),
      );

  const incs = await db
    .select()
    .from(schema.incidents)
    .where(whereClause)
    .orderBy(schema.incidents.startedAt);

  if (!incs.length) return [];
  const incIds = incs.map((i) => i.id);
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

  return incs.map((i) => ({ ...i, updates: byId.get(i.id) || [] }));
}

export async function listRecentResolvedIncidents(
  db: DB,
  teamId: string,
  statusPageId: string | null,
  daysBack: number = 30,
) {
  const cutoffTimestamp =
    Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60;

  const whereClause = statusPageId
    ? and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.statusPageId, statusPageId),
        eq(schema.incidents.status, "resolved"),
      )
    : and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.status, "resolved"),
      );

  const incs = await db
    .select()
    .from(schema.incidents)
    .where(whereClause)
    .orderBy(desc(schema.incidents.startedAt))
    .limit(50);

  const recentIncs = incs.filter((i) => (i.resolvedAt || 0) >= cutoffTimestamp);

  if (!recentIncs.length) return [];
  const incIds = recentIncs.map((i) => i.id);
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

  return recentIncs.map((i) => ({ ...i, updates: byId.get(i.id) || [] }));
}

export async function listAllIncidents(
  db: DB,
  teamId: string,
  limit: number = 50,
) {
  const incs = await db
    .select()
    .from(schema.incidents)
    .where(eq(schema.incidents.teamId, teamId))
    .orderBy(desc(schema.incidents.startedAt))
    .limit(limit);

  if (!incs.length) return [];
  const incIds = incs.map((i) => i.id);
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

  return incs.map((i) => ({ ...i, updates: byId.get(i.id) || [] }));
}

export async function createIncident(
  db: DB,
  teamId: string,
  input: {
    title: string;
    status: string;
    statusPageId?: string;
    monitorId?: string;
    message?: string;
    affectedComponents?: Array<{ componentId: string; impactLevel: string }>;
  },
) {
  const id = randomId("inc");
  const now = nowIso();
  const startedAt = Math.floor(Date.now() / 1000);

  await db.insert(schema.incidents).values({
    id,
    teamId,
    statusPageId: input.statusPageId || null,
    monitorId: input.monitorId || null,
    title: input.title,
    status: input.status,
    startedAt,
    resolvedAt: null,
    createdAt: now,
  });

  if (input.message) {
    const updateId = randomId("upd");
    await db.insert(schema.incidentUpdates).values({
      id: updateId,
      incidentId: id,
      message: input.message,
      status: input.status,
      createdAt: now,
    });
  }

  if (input.affectedComponents && input.affectedComponents.length > 0) {
    const componentLinks = input.affectedComponents.map((ac) => ({
      incidentId: id,
      componentId: ac.componentId,
      impactLevel: ac.impactLevel,
    }));
    await db.insert(schema.incidentComponents).values(componentLinks);

    const statusUpdatedAt = Math.floor(Date.now() / 1000);
    for (const ac of input.affectedComponents) {
      await db
        .update(schema.components)
        .set({
          currentStatus: ac.impactLevel,
          statusUpdatedAt,
        })
        .where(eq(schema.components.id, ac.componentId));
    }
  }

  return { id };
}

export async function findOpenIncidentForMonitor(
  db: DB,
  teamId: string,
  monitorId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: schema.incidents.id })
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.monitorId, monitorId),
        ne(schema.incidents.status, "resolved"),
      ),
    )
    .orderBy(desc(schema.incidents.startedAt))
    .limit(1);

  return rows[0]?.id ?? null;
}

export async function addIncidentUpdate(
  db: DB,
  teamId: string,
  incidentId: string,
  input: { message: string; status: string },
) {
  const incident = await db
    .select()
    .from(schema.incidents)
    .where(
      and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.id, incidentId),
      ),
    )
    .limit(1);

  if (!incident.length) {
    throw new Error("Incident not found");
  }

  const updateId = randomId("upd");
  const now = nowIso();

  await db.insert(schema.incidentUpdates).values({
    id: updateId,
    incidentId,
    message: input.message,
    status: input.status,
    createdAt: now,
  });

  const resolvedAt =
    input.status === "resolved" ? Math.floor(Date.now() / 1000) : null;

  await db
    .update(schema.incidents)
    .set({
      status: input.status,
      resolvedAt,
    })
    .where(eq(schema.incidents.id, incidentId));

  if (input.status === "resolved") {
    const affectedComponents = await db
      .select()
      .from(schema.incidentComponents)
      .where(eq(schema.incidentComponents.incidentId, incidentId));

    if (affectedComponents.length > 0) {
      const statusUpdatedAt = Math.floor(Date.now() / 1000);
      for (const ac of affectedComponents) {
        const otherOpenIncidents = await db
          .select()
          .from(schema.incidentComponents)
          .innerJoin(
            schema.incidents,
            eq(schema.incidentComponents.incidentId, schema.incidents.id),
          )
          .where(
            and(
              eq(schema.incidentComponents.componentId, ac.componentId),
              ne(schema.incidentComponents.incidentId, incidentId),
              ne(schema.incidents.status, "resolved"),
            ),
          );

        if (otherOpenIncidents.length === 0) {
          await db
            .update(schema.components)
            .set({
              currentStatus: "operational",
              statusUpdatedAt,
            })
            .where(eq(schema.components.id, ac.componentId));
        }
      }
    }
  }

  return { id: updateId };
}

export async function deleteIncident(
  db: DB,
  teamId: string,
  incidentId: string,
) {
  const affectedComponents = await db
    .select()
    .from(schema.incidentComponents)
    .where(eq(schema.incidentComponents.incidentId, incidentId));

  await db
    .delete(schema.incidentUpdates)
    .where(eq(schema.incidentUpdates.incidentId, incidentId));
  await db
    .delete(schema.incidentComponents)
    .where(eq(schema.incidentComponents.incidentId, incidentId));
  await db
    .delete(schema.incidents)
    .where(
      and(
        eq(schema.incidents.teamId, teamId),
        eq(schema.incidents.id, incidentId),
      ),
    );

  if (affectedComponents.length > 0) {
    const statusUpdatedAt = Math.floor(Date.now() / 1000);
    for (const ac of affectedComponents) {
      const otherOpenIncidents = await db
        .select()
        .from(schema.incidentComponents)
        .innerJoin(
          schema.incidents,
          eq(schema.incidentComponents.incidentId, schema.incidents.id),
        )
        .where(
          and(
            eq(schema.incidentComponents.componentId, ac.componentId),
            ne(schema.incidents.status, "resolved"),
          ),
        );

      if (otherOpenIncidents.length === 0) {
        await db
          .update(schema.components)
          .set({
            currentStatus: "operational",
            statusUpdatedAt,
          })
          .where(eq(schema.components.id, ac.componentId));
      }
    }
  }
}

export async function getIncidentComponents(db: DB, incidentId: string) {
  const components = await db
    .select({
      componentId: schema.incidentComponents.componentId,
      componentName: schema.components.name,
      impactLevel: schema.incidentComponents.impactLevel,
    })
    .from(schema.incidentComponents)
    .innerJoin(
      schema.components,
      eq(schema.incidentComponents.componentId, schema.components.id),
    )
    .where(eq(schema.incidentComponents.incidentId, incidentId));

  return components;
}
