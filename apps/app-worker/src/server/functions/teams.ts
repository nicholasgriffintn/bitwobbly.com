import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { schema } from "@bitwobbly/shared";
import { eq } from "drizzle-orm";

import { getDb } from "../lib/db";
import {
  createTeam,
  addUserToTeam,
  getUserTeams,
  switchTeam,
  getTeamById,
  validateTeamInvite,
  useTeamInvite,
} from "../repositories/teams";
import { useAppSession } from "../lib/session";

const CreateTeamSchema = z.object({
  name: z.string().min(1).max(100),
});

const JoinTeamSchema = z.object({
  inviteCode: z.string().min(1),
});

const SwitchTeamSchema = z.object({
  teamId: z.string(),
});

export const createTeamFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateTeamSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await useAppSession();
    const userId = session.data.userId;

    if (!userId) {
      throw new Error("Not authenticated");
    }

    const vars = env;
    const db = getDb(vars.DB);

    const { teamId } = await createTeam(db, userId, data.name);

    return { teamId };
  });

export const joinTeamFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => JoinTeamSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await useAppSession();
    const userId = session.data.userId;

    if (!userId) {
      throw new Error("Not authenticated");
    }

    const vars = env;
    const db = getDb(vars.DB);

    const invite = await validateTeamInvite(db, data.inviteCode);
    if (!invite) {
      throw new Error("Invalid or expired invite code");
    }

    await addUserToTeam(db, userId, invite.teamId, invite.role);
    await useTeamInvite(db, data.inviteCode);

    return { teamId: invite.teamId };
  });

export const getUserTeamsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useAppSession();
    const userId = session.data.userId;

    if (!userId) {
      return [];
    }

    const vars = env;
    const db = getDb(vars.DB);

    return await getUserTeams(db, userId);
  },
);

export const switchTeamFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SwitchTeamSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await useAppSession();
    const userId = session.data.userId;

    if (!userId) {
      throw new Error("Not authenticated");
    }

    const vars = env;
    const db = getDb(vars.DB);

    await switchTeam(db, userId, data.teamId);

    throw redirect({ to: "/app" });
  });

export const getCurrentTeamFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useAppSession();
    const userId = session.data.userId;

    if (!userId) {
      return null;
    }

    const vars = env;
    const db = getDb(vars.DB);

    const user = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user.length || !user[0].currentTeamId) {
      return null;
    }

    return await getTeamById(db, user[0].currentTeamId);
  },
);
