import { DB } from "@bitwobbly/shared";

export interface AuthUser {
  id: string;
  email: string;
  teamId?: string | null;
  currentTeamId?: string | null;
  createdAt: string;
  authProvider: "custom" | "cognito";
  cognitoSub?: string | null;
  mfaEnabled?: boolean;
  emailVerified?: boolean;
}

export interface SignUpInput {
  email: string;
  password: string;
  inviteCode?: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface MFASetupResult {
  secret: string;
  qrCodeUrl: string;
  session?: string;
}

export interface MFAChallengeInput {
  session: string;
  code: string;
  email: string;
}

export type SignInResult =
  | { user: AuthUser; session?: string }
  | { requiresMFA: true; session: string; email: string }
  | { requiresEmailVerification: true; email: string }
  | { requiresPasswordReset: true; email: string; session?: string }
  | {
      requiresMFASetup: true;
      session: string;
      email: string;
      challengeParameters?: Record<string, string>;
    };

export interface AuthAdapter {
  // Core authentication
  signUp(input: SignUpInput): Promise<{ user: AuthUser; session?: string }>;
  signIn(input: SignInInput): Promise<SignInResult>;
  signOut(userId: string): Promise<void>;
  getCurrentUser(sessionToken?: string): Promise<AuthUser | null>;
  getUserById(userId: string): Promise<AuthUser | null>;

  // Session management
  createSession(userId: string): Promise<{ sessionToken: string }>;
  validateSession(sessionToken: string): Promise<{ userId: string } | null>;
  deleteSession(sessionToken: string): Promise<void>;

  // MFA operations (optional))
  setupMFA?(input: { session: string; email: string }): Promise<MFASetupResult>;
  verifyMFA?(input: MFAChallengeInput): Promise<{ user: AuthUser }>;
  verifyMFASetup?(input: MFAChallengeInput): Promise<{ user: AuthUser }>;
  disableMFA?(userId: string): Promise<void>;

  // Email verification (optional)
  sendVerificationEmail?(email: string): Promise<void>;
  verifyEmail?(code: string, email: string): Promise<void>;
  resendVerificationCode?(email: string): Promise<void>;

  // Password management
  forgotPassword?(email: string): Promise<void>;
  confirmForgotPassword?(input: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<void>;
}

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  clientSecret?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface AuthConfig {
  provider: string;
  db: DB;
  cognito?: CognitoConfig;
}
