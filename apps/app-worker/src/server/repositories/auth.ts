import {
  nowIso,
  randomId,
  schema,
  type User,
  type UUID,
} from "@bitwobbly/shared";
import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
} from '@/context/auth';

export async function createUser(
  db: DrizzleD1Database,
  input: {
    email: string;
    password: string;
    team_id: UUID;
  },
): Promise<{ user: User }> {
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .limit(1);

  if (existing.length > 0) {
    throw new Error("User with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const userId = randomId("usr");
  const createdAt = nowIso();

  await db.insert(schema.users).values({
    id: userId,
    email: input.email,
    passwordHash,
    teamId: input.team_id,
    createdAt,
  });

  const user = {
    id: userId,
    email: input.email,
    passwordHash,
    teamId: input.team_id,
    createdAt,
  };

  return { user };
}

export async function authenticateUser(
  db: DrizzleD1Database,
  email: string,
  password: string,
): Promise<{ user: Omit<User, "password_hash"> }> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!user.length) {
    throw new Error("Invalid email or password");
  }

  const userData = user[0];
  const isValid = await verifyPassword(password, userData.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password");
  }

  const { passwordHash: _, ...userWithoutPassword } = userData;
  return { user: userWithoutPassword };
}

export async function getUserById(
  db: DrizzleD1Database,
  userId: UUID,
): Promise<Omit<User, "password_hash"> | null> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user.length) return null;

  const { passwordHash: _, ...userWithoutPassword } = user[0];
  return userWithoutPassword;
}

export async function createSession(
  db: DrizzleD1Database,
  userId: UUID,
): Promise<{ sessionToken: string }> {
  const sessionToken = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.insert(schema.sessions).values({
    id: sessionToken,
    userId,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
  });

  return { sessionToken };
}

export async function validateSession(
  db: DrizzleD1Database,
  sessionToken: string,
): Promise<{ userId: UUID } | null> {
  const session = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionToken))
    .limit(1);

  if (!session.length) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = session[0].expiresAt;

  if (now > expiresAt) {
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, sessionToken));
    return null;
  }

  return { userId: session[0].userId };
}

export async function deleteSession(
  db: DrizzleD1Database,
  sessionToken: string,
): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionToken));
}
