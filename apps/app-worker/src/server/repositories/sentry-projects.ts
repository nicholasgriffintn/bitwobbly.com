import { schema, nowIso, randomId, type DB } from "@bitwobbly/shared";
import { eq, and, desc } from "drizzle-orm";

export async function createSentryProject(
  db: DB,
  teamId: string,
  input: { name: string; platform?: string; componentId?: string },
) {
  const id = randomId("spr");

  const maxResult = await db
    .select({ max: schema.sentryProjects.sentryProjectId })
    .from(schema.sentryProjects)
    .orderBy(desc(schema.sentryProjects.sentryProjectId))
    .limit(1);
  const sentryProjectId = (maxResult[0]?.max ?? 0) + 1;

  const keyId = randomId("sk");
  const publicKey = crypto.randomUUID().replace(/-/g, "");
  const secretKey = crypto.randomUUID().replace(/-/g, "");

  await db.insert(schema.sentryProjects).values({
    id,
    teamId,
    sentryProjectId,
    name: input.name,
    platform: input.platform || null,
    componentId: input.componentId || null,
    createdAt: nowIso(),
  });

  await db.insert(schema.sentryKeys).values({
    id: keyId,
    projectId: id,
    publicKey,
    secretKey,
    label: "Default",
    status: "active",
    createdAt: nowIso(),
    revokedAt: null,
  });

  return { id, sentryProjectId, publicKey, secretKey };
}

export async function listSentryProjects(db: DB, teamId: string) {
  return db
    .select()
    .from(schema.sentryProjects)
    .where(eq(schema.sentryProjects.teamId, teamId))
    .orderBy(desc(schema.sentryProjects.createdAt));
}

export async function getSentryProject(
  db: DB,
  teamId: string,
  projectId: string,
) {
  const projects = await db
    .select()
    .from(schema.sentryProjects)
    .where(
      and(
        eq(schema.sentryProjects.id, projectId),
        eq(schema.sentryProjects.teamId, teamId),
      ),
    )
    .limit(1);

  return projects[0] || null;
}

export async function updateSentryProject(
  db: DB,
  teamId: string,
  projectId: string,
  input: {
    name?: string;
    platform?: string | null;
    componentId?: string | null;
  },
) {
  const project = await getSentryProject(db, teamId, projectId);
  if (!project) return null;

  await db
    .update(schema.sentryProjects)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.platform !== undefined && { platform: input.platform }),
      ...(input.componentId !== undefined && {
        componentId: input.componentId,
      }),
    })
    .where(
      and(
        eq(schema.sentryProjects.id, projectId),
        eq(schema.sentryProjects.teamId, teamId),
      ),
    );

  return getSentryProject(db, teamId, projectId);
}

export async function getSentryProjectDsn(
  db: DB,
  teamId: string,
  projectId: string,
  ingestHost: string,
) {
  const project = await getSentryProject(db, teamId, projectId);
  if (!project) return null;

  const keys = await db
    .select()
    .from(schema.sentryKeys)
    .where(
      and(
        eq(schema.sentryKeys.projectId, projectId),
        eq(schema.sentryKeys.status, "active"),
      ),
    )
    .limit(1);

  if (!keys[0]) return null;

  const dsn = `https://${keys[0].publicKey}@${ingestHost}/${project.sentryProjectId}`;

  return { project, key: keys[0], dsn };
}

export async function deleteSentryProject(
  db: DB,
  teamId: string,
  projectId: string,
) {
  const project = await getSentryProject(db, teamId, projectId);
  if (!project) return null;

  await db
    .delete(schema.sentryKeys)
    .where(eq(schema.sentryKeys.projectId, projectId));

  await db
    .delete(schema.sentryEvents)
    .where(eq(schema.sentryEvents.projectId, projectId));

  await db
    .delete(schema.sentryIssues)
    .where(eq(schema.sentryIssues.projectId, projectId));

  await db
    .delete(schema.sentryProjects)
    .where(
      and(
        eq(schema.sentryProjects.id, projectId),
        eq(schema.sentryProjects.teamId, teamId),
      ),
    );

  return project;
}
