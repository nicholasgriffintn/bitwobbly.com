import { nowIso, randomId, schema, type DB } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";

export async function createTeam(
  db: DB,
  userId: string,
  teamName: string,
): Promise<{ teamId: string }> {
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
  userId: string,
  teamId: string,
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
    const updates: { currentTeamId: string; teamId?: string } = {
      currentTeamId: teamId,
    };
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
  userId: string,
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
  userId: string,
  teamId: string,
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
  teamId: string,
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
  teamId: string,
  createdBy: string,
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
): Promise<{ teamId: string; role: string } | null> {
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

export async function listTeamMembers(
  db: DB,
  teamId: string,
): Promise<
  Array<{ userId: string; email: string; role: string; joinedAt: string }>
> {
  const members = await db
    .select({
      userId: schema.userTeams.userId,
      email: schema.users.email,
      role: schema.userTeams.role,
      joinedAt: schema.userTeams.joinedAt,
    })
    .from(schema.userTeams)
    .innerJoin(schema.users, eq(schema.userTeams.userId, schema.users.id))
    .where(eq(schema.userTeams.teamId, teamId));

  return members;
}

export async function removeTeamMember(
  db: DB,
  teamId: string,
  userId: string,
): Promise<void> {
  const owners = await db
    .select()
    .from(schema.userTeams)
    .where(
      and(
        eq(schema.userTeams.teamId, teamId),
        eq(schema.userTeams.role, "owner"),
      ),
    );

  if (owners.length === 1 && owners[0].userId === userId) {
    throw new Error("Cannot remove the last owner from the team");
  }

  await db
    .delete(schema.userTeams)
    .where(
      and(
        eq(schema.userTeams.teamId, teamId),
        eq(schema.userTeams.userId, userId),
      ),
    );
}

export async function updateMemberRole(
  db: DB,
  teamId: string,
  userId: string,
  role: string,
): Promise<void> {
  await db
    .update(schema.userTeams)
    .set({ role })
    .where(
      and(
        eq(schema.userTeams.teamId, teamId),
        eq(schema.userTeams.userId, userId),
      ),
    );
}

export async function listTeamInvites(
  db: DB,
  teamId: string,
): Promise<
  Array<{
    inviteCode: string;
    email: string | null;
    role: string;
    createdBy: string;
    expiresAt: string;
    usedAt: string | null;
  }>
> {
  const invites = await db
    .select({
      inviteCode: schema.teamInvites.inviteCode,
      email: schema.teamInvites.email,
      role: schema.teamInvites.role,
      createdBy: schema.teamInvites.createdBy,
      expiresAt: schema.teamInvites.expiresAt,
      usedAt: schema.teamInvites.usedAt,
    })
    .from(schema.teamInvites)
    .where(eq(schema.teamInvites.teamId, teamId));

  return invites;
}

export async function revokeTeamInvite(
  db: DB,
  inviteCode: string,
): Promise<void> {
  await db
    .delete(schema.teamInvites)
    .where(eq(schema.teamInvites.inviteCode, inviteCode));
}

export async function updateTeamName(
  db: DB,
  teamId: string,
  name: string,
): Promise<void> {
  await db
    .update(schema.teams)
    .set({ name })
    .where(eq(schema.teams.id, teamId));
}

export async function deleteTeam(db: DB, teamId: string): Promise<void> {
  const hasMonitors = await db
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.teamId, teamId))
    .limit(1);

  const hasStatusPages = await db
    .select()
    .from(schema.statusPages)
    .where(eq(schema.statusPages.teamId, teamId))
    .limit(1);

  const hasProjects = await db
    .select()
    .from(schema.sentryProjects)
    .where(eq(schema.sentryProjects.teamId, teamId))
    .limit(1);

  if (hasMonitors.length || hasStatusPages.length || hasProjects.length) {
    throw new Error(
      "Cannot delete team with existing resources. Please delete all monitors, status pages, and projects first.",
    );
  }

  await db.delete(schema.userTeams).where(eq(schema.userTeams.teamId, teamId));

  await db
    .delete(schema.teamInvites)
    .where(eq(schema.teamInvites.teamId, teamId));

  await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
}

export async function getUserRole(
  db: DB,
  teamId: string,
  userId: string,
): Promise<string | null> {
  const membership = await db
    .select()
    .from(schema.userTeams)
    .where(
      and(
        eq(schema.userTeams.teamId, teamId),
        eq(schema.userTeams.userId, userId),
      ),
    )
    .limit(1);

  return membership.length ? membership[0].role : null;
}
