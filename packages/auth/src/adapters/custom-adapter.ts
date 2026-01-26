import { nowIso, randomId, schema, type DB } from "@bitwobbly/shared";
import { eq } from "drizzle-orm";

import type { AuthAdapter, AuthUser, SignInInput, SignUpInput } from "../types";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
} from "../utils/crypto";

export class CustomAuthAdapter implements AuthAdapter {
  constructor(private config: { db: DB }) {}

  async signUp(input: SignUpInput): Promise<{ user: AuthUser }> {
    const existing = await this.config.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, input.email))
      .limit(1);

    if (existing.length > 0) {
      throw new Error("User with this email already exists");
    }

    const pwHash = await hashPassword(input.password);
    const userId = randomId("usr");
    const createdAt = nowIso();
    const tempTeamId = randomId("team");

    await this.config.db.insert(schema.teams).values({
      id: tempTeamId,
      name: "Default Team",
      createdAt,
    });

    await this.config.db.insert(schema.users).values({
      id: userId,
      email: input.email,
      passwordHash: pwHash,
      teamId: tempTeamId,
      currentTeamId: tempTeamId,
      authProvider: "custom",
      createdAt,
    });

    await this.config.db.insert(schema.userTeams).values({
      userId,
      teamId: tempTeamId,
      role: "owner",
      joinedAt: createdAt,
    });

    const user: AuthUser = {
      id: userId,
      email: input.email,
      teamId: tempTeamId,
      currentTeamId: tempTeamId,
      authProvider: "custom",
      createdAt,
    };

    return { user };
  }

  async signIn(input: SignInInput): Promise<{ user: AuthUser }> {
    const users = await this.config.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, input.email))
      .limit(1);

    if (!users.length) {
      throw new Error("Invalid email or password");
    }

    const userData = users[0];

    if (!userData.passwordHash) {
      throw new Error("Invalid email or password");
    }

    const isValid = await verifyPassword(input.password, userData.passwordHash);
    if (!isValid) {
      throw new Error("Invalid email or password");
    }

    const user: AuthUser = {
      id: userData.id,
      email: userData.email,
      teamId: userData.teamId,
      currentTeamId: userData.currentTeamId,
      authProvider: "custom",
      createdAt: userData.createdAt,
    };

    return { user };
  }

  async signOut(_userId: string): Promise<void> {
    // Session cleanup handled by session management
    return;
  }

  async getCurrentUser(sessionToken?: string): Promise<AuthUser | null> {
    if (!sessionToken) return null;

    const sessionResult = await this.validateSession(sessionToken);
    if (!sessionResult) return null;

    return this.getUserById(sessionResult.userId);
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    const users = await this.config.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!users.length) return null;

    const userData = users[0];
    return {
      id: userData.id,
      email: userData.email,
      teamId: userData.teamId,
      currentTeamId: userData.currentTeamId,
      authProvider: "custom",
      createdAt: userData.createdAt,
    };
  }

  async createSession(userId: string): Promise<{ sessionToken: string }> {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.config.db.insert(schema.sessions).values({
      id: sessionToken,
      userId,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    });

    return { sessionToken };
  }

  async validateSession(
    sessionToken: string,
  ): Promise<{ userId: string } | null> {
    const sessions = await this.config.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionToken))
      .limit(1);

    if (!sessions.length) return null;

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = sessions[0].expiresAt;

    if (now > expiresAt) {
      await this.config.db
        .delete(schema.sessions)
        .where(eq(schema.sessions.id, sessionToken));
      return null;
    }

    return { userId: sessions[0].userId };
  }

  async deleteSession(sessionToken: string): Promise<void> {
    await this.config.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, sessionToken));
  }
}
