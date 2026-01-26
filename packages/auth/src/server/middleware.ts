import { redirect } from '@tanstack/react-router';
import { schema, type DB } from '@bitwobbly/shared';
import { eq, and } from 'drizzle-orm';

import { useAppSession } from './session';

export async function requireAuth(): Promise<string> {
  const session = await useAppSession();
  const userId = session.data.userId;

  if (!userId) {
    throw redirect({ to: '/login' });
  }

  return userId;
}

export async function requireTeam(
  db: DB,
): Promise<{ userId: string; teamId: string }> {
  const userId = await requireAuth();

  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!users.length || !users[0].currentTeamId) {
    throw redirect({ to: '/onboarding' });
  }

  const teamId = users[0].currentTeamId;

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
    throw redirect({ to: '/onboarding' });
  }

  return { userId, teamId };
}

export async function requireOwner(
  db: DB,
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

  if (!membership.length || membership[0].role !== 'owner') {
    throw new Error('Access denied: Owner role required');
  }
}
