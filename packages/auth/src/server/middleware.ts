import { redirect } from "@tanstack/react-router";
import { randomId, schema, type DB } from "@bitwobbly/shared";
import { eq, and } from "drizzle-orm";

import { useAppSession } from "./session";

export async function requireAuth(db?: DB): Promise<string> {
  const session = await useAppSession();
  const { userId, sessionToken } = session.data;

  if (!userId) {
    throw redirect({ to: "/login" });
  }

  if (db) {
    const nowSec = Math.floor(Date.now() / 1000);

    if (!sessionToken) {
      const newSessionToken = randomId("sess");
      const expiresAt = nowSec + 30 * 24 * 60 * 60;

      await db.insert(schema.sessions).values({
        id: newSessionToken,
        userId,
        expiresAt,
      });

      await session.update({
        ...session.data,
        sessionToken: newSessionToken,
      });
    } else {
      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionToken))
        .limit(1);

      const validSession = sessions[0];
      const isValid =
        validSession &&
        validSession.userId === userId &&
        validSession.expiresAt > nowSec;

      if (!isValid) {
        if (validSession) {
          await db
            .delete(schema.sessions)
            .where(eq(schema.sessions.id, sessionToken));
        }
        await session.clear();
        throw redirect({ to: "/login" });
      }
    }
  }

  return userId;
}

export async function requireTeam(
  db: DB
): Promise<{ userId: string; teamId: string }> {
  const userId = await requireAuth(db);

  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!users.length || !users[0].currentTeamId) {
    throw redirect({ to: "/onboarding" });
  }

  const teamId = users[0].currentTeamId;

  const membership = await db
    .select()
    .from(schema.userTeams)
    .where(
      and(
        eq(schema.userTeams.userId, userId),
        eq(schema.userTeams.teamId, teamId)
      )
    )
    .limit(1);

  if (!membership.length) {
    throw redirect({ to: "/onboarding" });
  }

  return { userId, teamId };
}

export async function requireOwner(
  db: DB,
  teamId: string,
  userId: string
): Promise<void> {
  const membership = await db
    .select()
    .from(schema.userTeams)
    .where(
      and(
        eq(schema.userTeams.userId, userId),
        eq(schema.userTeams.teamId, teamId)
      )
    )
    .limit(1);

  if (!membership.length || membership[0].role !== "owner") {
    throw new Error("Access denied: Owner role required");
  }
}
