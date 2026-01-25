import {
  nowIso,
  randomId,
  schema,
  type UUID,
  type DB,
} from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";

export async function createTeam(
  db: DB,
  userId: UUID,
  teamName: string,
): Promise<{ teamId: UUID }> {
  const teamId = randomId("team");
  const now = nowIso();

  await db.insert(schema.teams).values({
    id: teamId,
    name: teamName,
    createdAt: now,
  });

  await db.insert(schema.userTeams).values({
    userId,
    teamId,
    role: "owner",
    joinedAt: now,
  });

  await db
    .update(schema.users)
    .set({ currentTeamId: teamId })
    .where(eq(schema.users.id, userId));

  return { teamId };
}

export async function addUserToTeam(
  db: DB,
  userId: UUID,
  teamId: UUID,
  role: string = "member",
): Promise<void> {
  const now = nowIso();

  await db.insert(schema.userTeams).values({
    userId,
    teamId,
    role,
    joinedAt: now,
  });

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (user.length) {
    const updates: any = { currentTeamId: teamId };
    if (!user[0].teamId) {
      updates.teamId = teamId;
    }
    await db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, userId));
  }
}

export async function getUserTeams(
  db: DB,
  userId: UUID,
): Promise<
  Array<{ id: string; name: string; role: string; joinedAt: string }>
> {
  const teams = await db
    .select({
      id: schema.teams.id,
      name: schema.teams.name,
      role: schema.userTeams.role,
      joinedAt: schema.userTeams.joinedAt,
    })
    .from(schema.userTeams)
    .innerJoin(schema.teams, eq(schema.userTeams.teamId, schema.teams.id))
    .where(eq(schema.userTeams.userId, userId));

  return teams;
}

export async function switchTeam(
  db: DB,
  userId: UUID,
  teamId: UUID,
): Promise<void> {
  const membership = await db
    .select()
    .from(schema.userTeams)
    .where(
      and(
        eq(schema.userTeams.userId, userId),
        eq(schema.userTeams.teamId, teamId),
      ),
    )
    .limit(1);

  if (!membership.length) {
    throw new Error("User is not a member of this team");
  }

  await db
    .update(schema.users)
    .set({ currentTeamId: teamId })
    .where(eq(schema.users.id, userId));
}

export async function getTeamById(
  db: DB,
  teamId: UUID,
): Promise<{ id: string; name: string } | null> {
  const teams = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);

  return teams.length ? teams[0] : null;
}

export async function createTeamInvite(
  db: DB,
  teamId: UUID,
  createdBy: UUID,
  email?: string,
  role: string = "member",
  expiresInDays: number = 7,
): Promise<{ inviteCode: string }> {
  const inviteId = randomId("inv");
  const inviteCode = randomId("code");
  const now = nowIso();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  await db.insert(schema.teamInvites).values({
    id: inviteId,
    teamId,
    email,
    inviteCode,
    role,
    createdBy,
    createdAt: now,
    expiresAt: expiresAt.toISOString(),
    usedAt: null,
  });

  return { inviteCode };
}

export async function validateTeamInvite(
  db: DB,
  inviteCode: string,
): Promise<{ teamId: UUID; role: string } | null> {
  const invites = await db
    .select()
    .from(schema.teamInvites)
    .where(eq(schema.teamInvites.inviteCode, inviteCode))
    .limit(1);

  if (!invites.length) return null;

  const invite = invites[0];

  if (invite.usedAt) return null;

  const now = new Date();
  const expiresAt = new Date(invite.expiresAt);
  if (now > expiresAt) return null;

  return { teamId: invite.teamId, role: invite.role };
}

export async function useTeamInvite(db: DB, inviteCode: string): Promise<void> {
  const now = nowIso();
  await db
    .update(schema.teamInvites)
    .set({ usedAt: now })
    .where(eq(schema.teamInvites.inviteCode, inviteCode));
}
