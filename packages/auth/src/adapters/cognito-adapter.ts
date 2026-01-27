// NOTE: Details on api can be found here: https://docs.aws.amazon.com/cli/latest/reference/cognito-idp/
import { AwsClient } from 'aws4fetch';
import { nowIso, randomId, schema, type DB } from '@bitwobbly/shared';
import { eq } from 'drizzle-orm';

import type {
  AuthAdapter,
  AuthUser,
  SignInInput,
  SignInResult,
  SignUpInput,
  MFASetupResult,
  MFAChallengeInput,
  CognitoConfig,
} from '../types';
import { getVerifier } from './lib/cognito/jwt';

type AuthenticationResultResponse = {
  AvailableChallenges?: string[];
  ChallengeName?: string;
  ChallengeParameters?: Record<string, string>;
  Session?: string;
  AuthenticationResult?: {
    AccessToken: string;
    ExpiresIn: number;
    IdToken: string;
    NewDeviceMetadata?: {
      DeviceKey: string;
      DeviceGroupKey: string;
    };
    RefreshToken: string;
    TokenType: string;
  };
};

type CognitoErrorResponse = {
  __type: string;
  message: string;
};

type SignUpResponse = {
  UserSub: string;
  UserConfirmed: boolean;
  Session: string;
  CodeDeliveryDetails?: {
    AttributeName: string;
    DeliveryMedium: string;
    Destination: string;
  };
};

export class CognitoAuthAdapter implements AuthAdapter {
  private client: AwsClient;
  private verifier: ReturnType<typeof getVerifier>;
  private clientId: string;
  private hmacKey?: string;
  private db: DB;

  constructor(config: CognitoConfig & { db: DB }) {
    if (!config.region || !config.userPoolId || !config.clientId) {
      throw new Error(
        'Cognito configuration is incomplete. Please provide region, userPoolId, and clientId.',
      );
    }

    this.client = new AwsClient({
      service: 'cognito-idp',
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });
    this.clientId = config.clientId;
    this.hmacKey = config.clientSecret;
    this.db = config.db;
    this.verifier = getVerifier({
      awsRegion: config.region,
      userPoolId: config.userPoolId,
      tokenType: 'access',
      appClientId: config.clientId,
    });
  }

  private async computeHash(username: string): Promise<string | null> {
    if (!this.hmacKey) return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.hmacKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(username + this.clientId),
    );
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  async signUp(input: SignUpInput): Promise<{ user: AuthUser }> {
    const existing = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, input.email))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('User with this email already exists');
    }

    const hash = await this.computeHash(input.email);

    const awsUrl = `https://cognito-idp.${this.client.region}.amazonaws.com/`;
    const signUpResult = await this.client.fetch(awsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
        'User-Agent': 'cloudflare-auth-adapter-cognito/1.0.0',
      },
      body: JSON.stringify({
        ClientId: this.clientId,
        Username: input.email,
        Password: input.password,
        UserAttributes: [{ Name: 'email', Value: input.email }],
        SecretHash: hash,
      }),
    });

    if (!signUpResult.ok) {
      const errorData = await signUpResult.json();
      console.error('Cognito SignUp Error:', errorData);
      throw new Error(`Failed to create user in Cognito`);
    }

    const signUpData = (await signUpResult.json()) as SignUpResponse;

    const cognitoSub = signUpData.UserSub;
    if (!cognitoSub) {
      throw new Error('Failed to create user in Cognito');
    }

    const userId = randomId('usr');
    const createdAt = nowIso();
    const tempTeamId = randomId('team');

    await this.db
      .insert(schema.teams)
      .values({ id: tempTeamId, name: 'Default Team', createdAt });

    await this.db.insert(schema.users).values({
      id: userId,
      email: input.email,
      passwordHash: null,
      teamId: tempTeamId,
      currentTeamId: tempTeamId,
      authProvider: 'cognito',
      cognitoSub,
      mfaEnabled: 0,
      emailVerified: signUpData.UserConfirmed ? 1 : 0,
      createdAt,
    });

    await this.db.insert(schema.userTeams).values({
      userId,
      teamId: tempTeamId,
      role: 'owner',
      joinedAt: createdAt,
    });

    return {
      user: {
        id: userId,
        email: input.email,
        teamId: tempTeamId,
        currentTeamId: tempTeamId,
        authProvider: 'cognito',
        cognitoSub,
        mfaEnabled: false,
        emailVerified: signUpData.UserConfirmed || false,
        createdAt,
      },
    };
  }

  async signIn(input: SignInInput): Promise<SignInResult> {
    const hash = await this.computeHash(input.email);

    const awsUrl = `https://cognito-idp.${this.client.region}.amazonaws.com/`;
    const authResult = await this.client.fetch(awsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        'User-Agent': 'cloudflare-auth-adapter-cognito/1.0.0',
      },
      body: JSON.stringify({
        ClientId: this.clientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: input.email,
          PASSWORD: input.password,
          SECRET_HASH: hash || '',
        },
      }),
    });

    if (!authResult.ok) {
      const errorData = (await authResult.json()) as CognitoErrorResponse;

      if (errorData.__type === 'UserNotConfirmedException') {
        return {
          requiresEmailVerification: true,
          email: input.email,
        };
      }

      if (errorData.__type === 'PasswordResetRequiredException') {
        return {
          requiresPasswordReset: true,
          email: input.email,
        };
      }

      throw new Error('Invalid email or password');
    }

    const authData = (await authResult.json()) as AuthenticationResultResponse;

    if (authData.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      if (!authData.Session) {
        throw new Error('MFA session missing from Cognito response');
      }
      return {
        requiresMFA: true,
        session: authData.Session,
        email: input.email,
      };
    }

    if (authData.ChallengeName === 'MFA_SETUP') {
      if (!authData.Session) {
        throw new Error('MFA session missing from Cognito response');
      }
      return {
        requiresMFASetup: true,
        session: authData.Session,
        email: input.email,
        challengeParameters: authData.ChallengeParameters,
      };
    }

    const accessToken = authData.AuthenticationResult?.AccessToken;
    if (!accessToken) {
      throw new Error('Failed to authenticate with Cognito');
    }

    const auth = await this.verifier.verify(accessToken);

    if (!auth?.payload?.sub) {
      throw new Error('Invalid token payload');
    }

    const cognitoSub = auth.payload.sub;
    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.cognitoSub, cognitoSub))
      .limit(1);

    if (!users.length) {
      throw new Error('User not found');
    }

    const userData = users[0];

    return {
      user: {
        id: userData.id,
        email: userData.email,
        teamId: userData.teamId,
        currentTeamId: userData.currentTeamId,
        authProvider: 'cognito',
        cognitoSub: userData.cognitoSub,
        mfaEnabled: userData.mfaEnabled === 1,
        emailVerified: userData.emailVerified === 1,
        createdAt: userData.createdAt,
      },
      session: accessToken,
    };
  }

  async signOut(_userId: string): Promise<void> {
    return;
  }

  async getCurrentUser(accessToken?: string): Promise<AuthUser | null> {
    if (!accessToken) return null;
    try {
      const auth = await this.verifier.verify(accessToken);

      if (!auth?.payload?.sub) {
        return null;
      }

      const cognitoSub = auth.payload.sub;

      const users = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.cognitoSub, cognitoSub))
        .limit(1);

      if (!users.length) {
        return null;
      }

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

    if (!users.length) {
      return null;
    }

    return this.mapUserData(users[0]);
  }

  private mapUserData(userData: typeof schema.users.$inferSelect): AuthUser {
    return {
      id: userData.id,
      email: userData.email,
      teamId: userData.teamId,
      currentTeamId: userData.currentTeamId,
      authProvider: 'cognito',
      cognitoSub: userData.cognitoSub,
      mfaEnabled: userData.mfaEnabled === 1,
      emailVerified: userData.emailVerified === 1,
      createdAt: userData.createdAt,
    };
  }

  async createSession(userId: string): Promise<{ sessionToken: string }> {
    const sessionToken = randomId('sess');

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

    if (!sessions.length) {
      return null;
    }

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
    // TODO: Implement MFA setup flow
    throw new Error('MFA setup requires active session with access token');
  }

  async verifyMFA(input: MFAChallengeInput): Promise<{ user: AuthUser }> {
    const hash = await this.computeHash(input.email);

    const awsUrl = `https://cognito-idp.${this.client.region}.amazonaws.com/`;
    const authResult = await this.client.fetch(awsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target':
          'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
        'User-Agent': 'cloudflare-auth-adapter-cognito/1.0.0',
      },
      body: JSON.stringify({
        ClientId: this.clientId,
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        Session: input.session,
        ChallengeResponses: {
          USERNAME: input.email,
          SOFTWARE_TOKEN_MFA_CODE: input.code,
          SECRET_HASH: hash || '',
        },
      }),
    });

    if (!authResult.ok) {
      const errorData = await authResult.json();
      console.error('Cognito MFA Verification Error:', errorData);
      throw new Error('MFA verification failed');
    }

    const authData = (await authResult.json()) as AuthenticationResultResponse;

    const accessToken = authData.AuthenticationResult?.AccessToken;

    if (!accessToken) {
      throw new Error('MFA verification failed');
    }

    const auth = await this.verifier.verify(accessToken);

    if (!auth?.payload?.sub) {
      throw new Error('Invalid token payload');
    }

    const cognitoSub = auth.payload.sub;

    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.cognitoSub, cognitoSub))
      .limit(1);

    if (!users.length) {
      throw new Error('User not found');
    }

    const userData = users[0];

    return {
      user: {
        id: userData.id,
        email: userData.email,
        teamId: userData.teamId,
        currentTeamId: userData.currentTeamId,
        authProvider: 'cognito',
        cognitoSub: userData.cognitoSub,
        mfaEnabled: true,
        emailVerified: userData.emailVerified === 1,
        createdAt: userData.createdAt,
      },
    };
  }

  async disableMFA(_userId: string): Promise<void> {
    // TODO: Implement MFA disable flow
    throw new Error('MFA disable not yet implemented');
  }

  async sendVerificationEmail(email: string): Promise<void> {
    const hash = await this.computeHash(email);

    const awsUrl = `https://cognito-idp.${this.client.region}.amazonaws.com/`;
    const signUpResult = await this.client.fetch(awsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target':
          'AWSCognitoIdentityProviderService.ResendConfirmationCode',
        'User-Agent': 'cloudflare-auth-adapter-cognito/1.0.0',
      },
      body: JSON.stringify({
        ClientId: this.clientId,
        Username: email,
        SecretHash: hash || '',
      }),
    });

    if (!signUpResult.ok) {
      const errorData = await signUpResult.json();
      console.error('Cognito Resend Confirmation Code Error:', errorData);
      throw new Error(`Failed to resend verification email`);
    }

    return;
  }

  async verifyEmail(code: string, email: string): Promise<void> {
    const hash = await this.computeHash(email);

    const awsUrl = `https://cognito-idp.${this.client.region}.amazonaws.com/`;
    const confirmResult = await this.client.fetch(awsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp',
        'User-Agent': 'cloudflare-auth-adapter-cognito/1.0.0',
      },
      body: JSON.stringify({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: code,
        SecretHash: hash || '',
      }),
    });

    if (!confirmResult.ok) {
      const errorData = await confirmResult.json();
      console.error('Cognito Confirm SignUp Error:', errorData);
      throw new Error(`Failed to verify email`);
    }

    await this.db
      .update(schema.users)
      .set({ emailVerified: 1 })
      .where(eq(schema.users.email, email));
  }

  async resendVerificationCode(email: string): Promise<void> {
    await this.sendVerificationEmail(email);
  }

  async forgotPassword(email: string): Promise<void> {
    const hash = await this.computeHash(email);

    const awsUrl = `https://cognito-idp.${this.client.region}.amazonaws.com/`;
    const result = await this.client.fetch(awsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ForgotPassword',
        'User-Agent': 'cloudflare-auth-adapter-cognito/1.0.0',
      },
      body: JSON.stringify({
        ClientId: this.clientId,
        Username: email,
        SecretHash: hash || '',
      }),
    });

    if (!result.ok) {
      const errorData = await result.json();
      console.error('Cognito Forgot Password Error:', errorData);
      throw new Error('Failed to initiate password reset');
    }
  }

  async confirmForgotPassword(input: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<void> {
    const hash = await this.computeHash(input.email);

    const awsUrl = `https://cognito-idp.${this.client.region}.amazonaws.com/`;
    const result = await this.client.fetch(awsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target':
          'AWSCognitoIdentityProviderService.ConfirmForgotPassword',
        'User-Agent': 'cloudflare-auth-adapter-cognito/1.0.0',
      },
      body: JSON.stringify({
        ClientId: this.clientId,
        Username: input.email,
        ConfirmationCode: input.code,
        Password: input.newPassword,
        SecretHash: hash || '',
      }),
    });

    if (!result.ok) {
      const errorData = await result.json();
      console.error('Cognito Confirm Forgot Password Error:', errorData);
      throw new Error('Failed to reset password');
    }
  }
}
