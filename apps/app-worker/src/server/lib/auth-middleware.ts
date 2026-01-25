import { redirect } from "@tanstack/react-router";
import { env } from 'cloudflare:workers';

import { getDb } from './db';
import { getUserById } from '../repositories/auth';
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
    throw redirect({ to: '/onboarding' });
  }

  const teamId = user.currentTeamId || user.teamId;

  if (!teamId) {
    throw redirect({ to: '/onboarding' });
  }

  return { userId, teamId };
}
