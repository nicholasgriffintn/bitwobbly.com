# @bitwobbly/auth

Pluggable authentication package supporting custom PBKDF2 and AWS Cognito with MFA and email verification.

## Features

- **Adapter Pattern**: Switch between auth providers via configuration
- **Custom Auth**: PBKDF2 password hashing with 100k iterations
- **AWS Cognito**: Full integration with MFA and email verification
- **React Components**: Pre-built login, signup, MFA, and email verification UI
- **Server Functions**: TanStack Start server functions for auth operations
- **TypeScript**: Full type safety across all APIs

## Installation

```bash
pnpm add @bitwobbly/auth
```

## Configuration

### Custom Auth (Default)

```json
// wrangler.json
{
  "vars": {
    "AUTH_PROVIDER": "custom"
  }
}
```

### AWS Cognito

```json
// wrangler.json
{
  "vars": {
    "AUTH_PROVIDER": "cognito",
    "COGNITO_REGION": "us-east-1",
    "COGNITO_USER_POOL_ID": "us-east-1_xxxxx",
    "COGNITO_CLIENT_ID": "xxxxxxxxxxxxx"
  }
}
```

## Usage

### Server Setup

```typescript
// server/functions/auth.ts
import { env } from 'cloudflare:workers';
import { getDb } from '../lib/db';
import {
  createAuthAdapter,
  createSignUpFn,
  createSignInFn,
  createSignOutFn,
  createGetCurrentUserFn,
} from '@bitwobbly/auth/server';

function getAdapter() {
  const vars = env;
  return createAuthAdapter({
    provider: vars.AUTH_PROVIDER,
    db: getDb(vars.DB),
    cognito:
      vars.AUTH_PROVIDER === 'cognito'
        ? {
            region: vars.COGNITO_REGION,
            userPoolId: vars.COGNITO_USER_POOL_ID,
            clientId: vars.COGNITO_CLIENT_ID,
          }
        : undefined,
  });
}

export const signUpFn = createSignUpFn(getAdapter(), env.INVITE_CODE);
export const signInFn = createSignInFn(getAdapter());
export const signOutFn = createSignOutFn();
export const getCurrentUserFn = createGetCurrentUserFn(getAdapter());
```

### React Setup

```tsx
// routes/__root.tsx
import { AuthProvider } from '@bitwobbly/auth/react';
import { signInFn, signUpFn, signOutFn } from '@/server/functions/auth';

function RootDocument() {
  return (
    <AuthProvider
      signInFn={async (data) => await signInFn({ data })}
      signUpFn={async (data) => await signUpFn({ data })}
      signOutFn={signOutFn}
    >
      <Outlet />
    </AuthProvider>
  );
}
```

### Using in Components

```tsx
import { useAuth } from '@bitwobbly/auth/react';

function LoginPage() {
  const { signIn, signUp, loading } = useAuth();

  const handleLogin = async () => {
    await signIn(email, password);
  };

  return <div>{/* Your login UI */}</div>;
}
```

### Pre-built Components

```tsx
import { LoginForm, SignUpForm } from '@bitwobbly/auth/components';

function AuthPage() {
  return (
    <div>
      <LoginForm onSuccess={() => navigate('/app')} />
      <SignUpForm onSuccess={() => navigate('/onboarding')} />
    </div>
  );
}
```

## Database Schema

The package requires these columns in your `users` table:

```typescript
users: {
  id: string;
  email: string;
  passwordHash: string | null; // nullable for Cognito users
  authProvider: 'custom' | 'cognito';
  cognitoSub: string | null;
  mfaEnabled: 0 | 1;
  emailVerified: 0 | 1;
  // ... your other columns
}
```

## MFA Support (Cognito Only)

```tsx
import { MFASetup, MFAChallenge } from '@bitwobbly/auth/components';
import { useMFA } from '@bitwobbly/auth/react';

function SettingsPage() {
  const { setupMFA, verifyMFA, disableMFA } = useMFA();

  return (
    <div>
      <MFASetup onComplete={() => console.log('MFA enabled')} />
    </div>
  );
}
```

## Email Verification (Cognito Only)

```tsx
import { EmailVerification } from '@bitwobbly/auth/components';

function VerifyEmailPage() {
  const handleVerify = async (code: string) => {
    // Verification logic
  };

  return (
    <EmailVerification
      email="user@example.com"
      onVerify={handleVerify}
      onResend={async () => console.log('Resent')}
    />
  );
}
```

## Middleware

```typescript
import { requireAuth, requireTeam, requireOwner } from '@bitwobbly/auth/server';

export async function protectedRoute() {
  const userId = await requireAuth(); // Redirects to /login if not authenticated
  const { userId, teamId } = await requireTeam(); // Also checks team membership
  await requireOwner(db, teamId, userId); // Throws error if not owner
}
```

## API Reference

### AuthAdapter Interface

```typescript
interface AuthAdapter {
  signUp(input: SignUpInput): Promise<{ user: AuthUser }>;
  signIn(
    input: SignInInput,
  ): Promise<{ user: AuthUser; requiresMFA?: boolean }>;
  signOut(userId: string): Promise<void>;
  getCurrentUser(sessionToken?: string): Promise<AuthUser | null>;
  createSession(userId: string): Promise<{ sessionToken: string }>;
  validateSession(sessionToken: string): Promise<{ userId: string } | null>;
  deleteSession(sessionToken: string): Promise<void>;

  // Cognito only
  setupMFA?(userId: string): Promise<MFASetupResult>;
  verifyMFA?(input: MFAChallengeInput): Promise<{ user: AuthUser }>;
  disableMFA?(userId: string): Promise<void>;
  sendVerificationEmail?(email: string): Promise<void>;
  verifyEmail?(code: string, email: string): Promise<void>;
}
```

## Security

- **Custom Auth**: PBKDF2 with 100,000 iterations and SHA-256
- **Cognito**: AWS-managed security with JWT verification
- **Sessions**: 30-day expiry with database tracking
- **Constant-time comparison**: Prevents timing attacks
