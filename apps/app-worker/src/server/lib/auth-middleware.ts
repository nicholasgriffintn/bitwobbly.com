import { redirect } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq, and } from "drizzle-orm";
import { schema } from "@bitwobbly/shared";

import { getDb } from "./db";
import { getUserById } from "../repositories/auth";
import { useAppSession } from "./session";

export async function requireAuth() {
  const session = await useAppSession();
  if (!session.data.userId) {
    throw redirect({ to: "/login" });
  }
  return session.data.userId;
}

export async function requireTeam() {
  const userId = await requireAuth();
  const vars = env;
  const db = getDb(vars.DB);
  const user = await getUserById(db, userId);

  if (!user) {
    throw redirect({ to: "/onboarding" });
  }

  const teamId = user.currentTeamId || user.teamId;

  if (!teamId) {
    throw redirect({ to: "/onboarding" });
  }

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
    throw new Error("Access denied: User is not a member of this team");
  }

  return { userId, teamId };
}

export async function requireOwner(
  db: ReturnType<typeof getDb>,
  teamId: string,
  userId: string,
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

  if (!membership.length || membership[0].role !== "owner") {
    throw new Error("Access denied: Owner role required");
  }
}
