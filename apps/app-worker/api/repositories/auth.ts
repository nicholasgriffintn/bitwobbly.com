import type { D1Database } from '@cloudflare/workers-types';
import { nowIso, randomId, type User, type UUID } from '@bitwobbly/shared';

import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
} from '../lib/auth';

export async function createUser(
  db: D1Database,
  input: {
    email: string;
    password: string;
    team_id: UUID;
  },
): Promise<{ user: User }> {
  const existing = await db
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(input.email)
    .first();
  if (existing) {
    throw new Error('User with this email already exists');
  }

  const password_hash = await hashPassword(input.password);
  const user = {
    id: randomId('usr'),
    email: input.email,
    password_hash,
    team_id: input.team_id,
    created_at: nowIso(),
  };

  await db
    .prepare(
      'INSERT INTO users (id, email, password_hash, team_id, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(
      user.id,
      user.email,
      user.password_hash,
      user.team_id,
      user.created_at,
    )
    .run();

  return { user };
}

export async function authenticateUser(
  db: D1Database,
  email: string,
  password: string,
): Promise<{ user: Omit<User, 'password_hash'> }> {
  const user = (await db
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first()) as User | null;

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  const { password_hash: _, ...userWithoutPassword } = user;
  return { user: userWithoutPassword };
}

export async function getUserById(
  db: D1Database,
  userId: UUID,
): Promise<Omit<User, 'password_hash'> | null> {
  const user = (await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first()) as User | null;

  if (!user) return null;

  const { password_hash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

export async function createSession(
  db: D1Database,
  userId: UUID,
): Promise<{ sessionToken: string }> {
  const sessionToken = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db
    .prepare(
      'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    )
    .bind(sessionToken, userId, expiresAt.toISOString(), nowIso())
    .run();

  return { sessionToken };
}

export async function validateSession(
  db: D1Database,
  sessionToken: string,
): Promise<{ userId: UUID } | null> {
  const session = await db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?')
    .bind(sessionToken)
    .first();

  if (!session) return null;

  const now = new Date();
  const expiresAt = new Date(session.expires_at as string);

  if (now > expiresAt) {
    await db
      .prepare('DELETE FROM sessions WHERE id = ?')
      .bind(sessionToken)
      .run();
    return null;
  }

  return { userId: session.user_id as UUID };
}

export async function deleteSession(
  db: D1Database,
  sessionToken: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM sessions WHERE id = ?')
    .bind(sessionToken)
    .run();
}
