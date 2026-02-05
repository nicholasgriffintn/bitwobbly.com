import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { schema } from "@bitwobbly/shared";
import { eq } from "drizzle-orm";
import { requireOwner, useAppSession } from "@bitwobbly/auth/server";

import { getDb } from "@bitwobbly/shared";
import { CreateTeamInputSchema } from "../validators/teams";
import { DEFAULT_TEAM_SLO_TARGET_PPM } from "../lib/availability";
import {
  createTeam,
  addUserToTeam,
  getUserTeams,
  switchTeam,
  getTeamById,
  validateTeamInvite,
  useTeamInvite,
  listTeamMembers,
  removeTeamMember,
  updateMemberRole,
  listTeamInvites,
  createTeamInvite,
  revokeTeamInvite,
  updateTeamName,
  deleteTeam,
} from "../repositories/teams";
import { requireTeam } from "../lib/auth-middleware";
import { upsertSloTarget } from "../repositories/slo-targets";

const JoinTeamSchema = z.object({
  inviteCode: z.string().min(1),
});

const SwitchTeamSchema = z.object({
  teamId: z.string(),
});

export const createTeamFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateTeamInputSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await useAppSession();
    const userId = session.data.userId;

    if (!userId) {
      throw new Error("Not authenticated");
    }

    const vars = env;
    const db = getDb(vars.DB);

    const { teamId } = await createTeam(db, userId, data.name);

    try {
      await upsertSloTarget(
        db,
        teamId,
        "team",
        teamId,
        DEFAULT_TEAM_SLO_TARGET_PPM
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        !(
          message.toLowerCase().includes("no such table") &&
          message.includes("slo_targets")
        )
      ) {
        throw e;
      }
    }

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
  }
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
  }
);

export const listTeamMembersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const members = await listTeamMembers(db, teamId);
    return { members };
  }
);

export const removeTeamMemberFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string() }).parse(data)
  )
  .handler(async ({ data }) => {
    const { userId: actorId, teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await requireOwner(db, teamId, actorId);
    await removeTeamMember(db, teamId, data.userId);
    return { ok: true };
  });

export const updateMemberRoleFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ userId: z.string(), role: z.enum(["owner", "member"]) })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { userId: actorId, teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await requireOwner(db, teamId, actorId);
    await updateMemberRole(db, teamId, data.userId, data.role);
    return { ok: true };
  });

export const listTeamInvitesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const invites = await listTeamInvites(db, teamId);
    return { invites };
  }
);

export const createTeamInviteFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().email().optional(),
        role: z.enum(["owner", "member"]),
        expiresInDays: z.number().default(7),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { userId: actorId, teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await requireOwner(db, teamId, actorId);
    const result = await createTeamInvite(
      db,
      teamId,
      actorId,
      data.email,
      data.role,
      data.expiresInDays
    );
    return { inviteCode: result.inviteCode };
  });

export const revokeTeamInviteFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ inviteCode: z.string() }).parse(data)
  )
  .handler(async ({ data }) => {
    const { userId: actorId, teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await requireOwner(db, teamId, actorId);
    await revokeTeamInvite(db, data.inviteCode);
    return { ok: true };
  });

export const updateTeamNameFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ name: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    const { userId: actorId, teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await requireOwner(db, teamId, actorId);
    await updateTeamName(db, teamId, data.name);
    return { ok: true };
  });

export const deleteTeamFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { userId: actorId, teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await requireOwner(db, teamId, actorId);
    await deleteTeam(db, teamId);
    return { ok: true };
  }
);
