import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  ResendConfirmationCodeCommand,
  ConfirmSignUpCommand,
  type AuthFlowType,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { nowIso, randomId, schema, type DB } from "@bitwobbly/shared";
import { eq } from "drizzle-orm";

import type {
  AuthAdapter,
  AuthUser,
  SignInInput,
  SignUpInput,
  MFASetupResult,
  MFAChallengeInput,
  CognitoConfig,
} from "../types";

export class CognitoAuthAdapter implements AuthAdapter {
  private client: CognitoIdentityProviderClient;
  private verifier: ReturnType<typeof CognitoJwtVerifier.create>;
  private clientId: string;
  private db: DB;

  constructor(config: CognitoConfig & { db: DB }) {
    this.client = new CognitoIdentityProviderClient({ region: config.region });
    this.clientId = config.clientId;
    this.db = config.db;
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: config.userPoolId,
      tokenUse: "access",
      clientId: config.clientId,
    });
  }

  async signUp(input: SignUpInput): Promise<{ user: AuthUser }> {
    const existing = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, input.email))
      .limit(1);
    if (existing.length > 0)
      throw new Error("User with this email already exists");
    const signUpResult = await this.client.send(
      new SignUpCommand({
        ClientId: this.clientId,
        Username: input.email,
        Password: input.password,
        UserAttributes: [{ Name: "email", Value: input.email }],
      }),
    );
    const cognitoSub = signUpResult.UserSub;
    if (!cognitoSub) throw new Error("Failed to create user in Cognito");
    const userId = randomId("usr");
    const createdAt = nowIso();
    const tempTeamId = randomId("team");
    await this.db
      .insert(schema.teams)
      .values({ id: tempTeamId, name: "Default Team", createdAt });
    await this.db.insert(schema.users).values({
      id: userId,
      email: input.email,
      passwordHash: null,
      teamId: tempTeamId,
      currentTeamId: tempTeamId,
      authProvider: "cognito",
      cognitoSub,
      mfaEnabled: 0,
      emailVerified: signUpResult.UserConfirmed ? 1 : 0,
      createdAt,
    });
    await this.db.insert(schema.userTeams).values({
      userId,
      teamId: tempTeamId,
      role: "owner",
      joinedAt: createdAt,
    });
    return {
      user: {
        id: userId,
        email: input.email,
        teamId: tempTeamId,
        currentTeamId: tempTeamId,
        authProvider: "cognito",
        cognitoSub,
        mfaEnabled: false,
        emailVerified: signUpResult.UserConfirmed || false,
        createdAt,
      },
    };
  }

  async signIn(
    input: SignInInput,
  ): Promise<{ user: AuthUser; requiresMFA?: boolean; session?: string }> {
    try {
      const authResult = await this.client.send(
        new InitiateAuthCommand({
          ClientId: this.clientId,
          AuthFlow: "USER_PASSWORD_AUTH" as AuthFlowType,
          AuthParameters: { USERNAME: input.email, PASSWORD: input.password },
        }),
      );
      if (authResult.ChallengeName === "SOFTWARE_TOKEN_MFA")
        return {
          user: {} as AuthUser,
          requiresMFA: true,
          session: authResult.Session,
        };
      const accessToken = authResult.AuthenticationResult?.AccessToken;
      if (!accessToken) throw new Error("Failed to authenticate with Cognito");
      const payload = await this.verifier.verify(accessToken);
      const cognitoSub = payload.sub;
      const users = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.cognitoSub, cognitoSub))
        .limit(1);
      if (!users.length) throw new Error("User not found");
      const userData = users[0];
      return {
        user: {
          id: userData.id,
          email: userData.email,
          teamId: userData.teamId,
          currentTeamId: userData.currentTeamId,
          authProvider: "cognito",
          cognitoSub: userData.cognitoSub,
          mfaEnabled: userData.mfaEnabled === 1,
          emailVerified: userData.emailVerified === 1,
          createdAt: userData.createdAt,
        },
        session: accessToken,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("UserNotConfirmedException") ||
          error.name === "UserNotConfirmedException")
      )
        throw new Error("Please verify your email before signing in");
      throw new Error("Invalid email or password");
    }
  }

  async signOut(_userId: string): Promise<void> {
    return;
  }

  async getCurrentUser(accessToken?: string): Promise<AuthUser | null> {
    if (!accessToken) return null;
    try {
      const payload = await this.verifier.verify(accessToken);
      const cognitoSub = payload.sub;
      const users = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.cognitoSub, cognitoSub))
        .limit(1);
      if (!users.length) return null;
      return this.mapUserData(users[0]);
    } catch {
      return null;
    }
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!users.length) return null;
    return this.mapUserData(users[0]);
  }

  private mapUserData(userData: typeof schema.users.$inferSelect): AuthUser {
    return {
      id: userData.id,
      email: userData.email,
      teamId: userData.teamId,
      currentTeamId: userData.currentTeamId,
      authProvider: "cognito",
      cognitoSub: userData.cognitoSub,
      mfaEnabled: userData.mfaEnabled === 1,
      emailVerified: userData.emailVerified === 1,
      createdAt: userData.createdAt,
    };
  }

  async createSession(userId: string): Promise<{ sessionToken: string }> {
    const sessionToken = randomId("sess");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await this.db.insert(schema.sessions).values({
      id: sessionToken,
      userId,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    });
    return { sessionToken };
  }

  async validateSession(
    sessionToken: string,
  ): Promise<{ userId: string } | null> {
    const sessions = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionToken))
      .limit(1);
    if (!sessions.length) return null;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = sessions[0].expiresAt;
    if (now > expiresAt) {
      await this.db
        .delete(schema.sessions)
        .where(eq(schema.sessions.id, sessionToken));
      return null;
    }
    return { userId: sessions[0].userId };
  }

  async deleteSession(sessionToken: string): Promise<void> {
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, sessionToken));
  }

  async setupMFA(_userId: string): Promise<MFASetupResult> {
    throw new Error("MFA setup requires active session with access token");
  }

  async verifyMFA(input: MFAChallengeInput): Promise<{ user: AuthUser }> {
    const authResult = await this.client.send(
      new RespondToAuthChallengeCommand({
        ClientId: this.clientId,
        ChallengeName: "SOFTWARE_TOKEN_MFA",
        Session: input.session,
        ChallengeResponses: {
          USERNAME: input.email,
          SOFTWARE_TOKEN_MFA_CODE: input.code,
        },
      }),
    );
    const accessToken = authResult.AuthenticationResult?.AccessToken;
    if (!accessToken) throw new Error("MFA verification failed");
    const payload = await this.verifier.verify(accessToken);
    const cognitoSub = payload.sub;
    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.cognitoSub, cognitoSub))
      .limit(1);
    if (!users.length) throw new Error("User not found");
    const userData = users[0];
    return {
      user: {
        id: userData.id,
        email: userData.email,
        teamId: userData.teamId,
        currentTeamId: userData.currentTeamId,
        authProvider: "cognito",
        cognitoSub: userData.cognitoSub,
        mfaEnabled: true,
        emailVerified: userData.emailVerified === 1,
        createdAt: userData.createdAt,
      },
    };
  }

  async disableMFA(_userId: string): Promise<void> {
    throw new Error("MFA disable not yet implemented");
  }

  async sendVerificationEmail(email: string): Promise<void> {
    await this.client.send(
      new ResendConfirmationCodeCommand({
        ClientId: this.clientId,
        Username: email,
      }),
    );
  }

  async verifyEmail(code: string, email: string): Promise<void> {
    await this.client.send(
      new ConfirmSignUpCommand({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: code,
      }),
    );
    await this.db
      .update(schema.users)
      .set({ emailVerified: 1 })
      .where(eq(schema.users.email, email));
  }

  async resendVerificationCode(email: string): Promise<void> {
    await this.sendVerificationEmail(email);
  }
}
