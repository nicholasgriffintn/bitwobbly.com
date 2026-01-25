import { schema, nowIso, randomId, type DB } from "@bitwobbly/shared";
import { eq, and, desc } from "drizzle-orm";

export async function createSentryProject(
  db: DB,
  teamId: string,
  input: { name: string; platform?: string },
) {
  const id = randomId("spr");

  const maxResult = await db
    .select({ max: schema.sentryProjects.sentryProjectId })
    .from(schema.sentryProjects)
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
