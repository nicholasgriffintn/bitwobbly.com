import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  createAuthAdapter,
  signInHandler,
  signUpHandler,
  signOutHandler,
  getCurrentUserHandler,
  verifyMFAHandler,
  verifyEmailHandler,
  resendVerificationCodeHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  useAppSession,
} from '@bitwobbly/auth/server';

import { getDb } from "../lib/db";

const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteCode: z.string().min(1),
});

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const signUpFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SignUpSchema.parse(data))
  .handler(async ({ data }) => {
    const adapter = createAuthAdapter({
      provider: env.AUTH_PROVIDER || 'custom',
      db: getDb(env.DB),
      cognito:
        env.AUTH_PROVIDER === 'cognito'
          ? {
              region: env.COGNITO_REGION!,
              userPoolId: env.COGNITO_USER_POOL_ID!,
              clientId: env.COGNITO_CLIENT_ID!,
              clientSecret: env.COGNITO_CLIENT_SECRET!,
              accessKeyId: env.COGNITO_ACCESS_KEY_ID!,
              secretAccessKey: env.COGNITO_SECRET_ACCESS_KEY!,
            }
          : undefined,
    });

    const response = await signUpHandler(adapter, env.INVITE_CODE!, {
      email: data.email,
      password: data.password,
      inviteCode: data.inviteCode,
    });

    if (!response.user) {
      throw new Error("Sign up failed");
    }

    throw redirect({ to: "/onboarding" });
  });

export const signInFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SignInSchema.parse(data))
  .handler(async ({ data }) => {
    const adapter = createAuthAdapter({
      provider: env.AUTH_PROVIDER || 'custom',
      db: getDb(env.DB),
      cognito:
        env.AUTH_PROVIDER === 'cognito'
          ? {
              region: env.COGNITO_REGION!,
              userPoolId: env.COGNITO_USER_POOL_ID!,
              clientId: env.COGNITO_CLIENT_ID!,
              clientSecret: env.COGNITO_CLIENT_SECRET!,
              accessKeyId: env.COGNITO_ACCESS_KEY_ID!,
              secretAccessKey: env.COGNITO_SECRET_ACCESS_KEY!,
            }
          : undefined,
    });

    const response = await signInHandler(adapter, {
      email: data.email,
      password: data.password,
    });

    if (response.requiresEmailVerification) {
      throw redirect({
        to: `/verify-email`,
      });
    }

    if (response.requiresMFA) {
      throw redirect({ to: `/mfa-challenge` });
    }

    if ('requiresMFASetup' in response) {
      throw redirect({ to: `/setup-mfa` });
    }

    if (response.requiresPasswordReset) {
      throw redirect({ to: `/reset-password` });
    }

    throw redirect({ to: "/app" });
  });

export const signOutFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await signOutHandler();
    throw redirect({ to: "/login" });
  },
);

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const adapter = createAuthAdapter({
      provider: env.AUTH_PROVIDER || 'custom',
      db: getDb(env.DB),
      cognito:
        env.AUTH_PROVIDER === 'cognito'
          ? {
              region: env.COGNITO_REGION!,
              userPoolId: env.COGNITO_USER_POOL_ID!,
              clientId: env.COGNITO_CLIENT_ID!,
              clientSecret: env.COGNITO_CLIENT_SECRET!,
              accessKeyId: env.COGNITO_ACCESS_KEY_ID!,
              secretAccessKey: env.COGNITO_SECRET_ACCESS_KEY!,
            }
          : undefined,
    });

    const session = await useAppSession();
    const user = await getCurrentUserHandler(adapter);
    return {
      user,
      email: session.data.email ?? null,
      hasCognitoSession: Boolean(session.data.cognitoSession),
    };
  },
);

const VerifyMFASchema = z.object({
  code: z.string().min(1),
});

export const verifyMFAFn = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => VerifyMFASchema.parse(data))
  .handler(async ({ data }) => {
    const adapter = createAuthAdapter({
      provider: env.AUTH_PROVIDER || 'custom',
      db: getDb(env.DB),
      cognito:
        env.AUTH_PROVIDER === 'cognito'
          ? {
              region: env.COGNITO_REGION!,
              userPoolId: env.COGNITO_USER_POOL_ID!,
              clientId: env.COGNITO_CLIENT_ID!,
              clientSecret: env.COGNITO_CLIENT_SECRET!,
              accessKeyId: env.COGNITO_ACCESS_KEY_ID!,
              secretAccessKey: env.COGNITO_SECRET_ACCESS_KEY!,
            }
          : undefined,
    });

    await verifyMFAHandler(adapter, data.code);

    throw redirect({ to: '/app' });
  });

const VerifyEmailSchema = z.object({
  code: z.string().min(1),
  email: z.string().email().optional(),
});

export const verifyEmailFn = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => VerifyEmailSchema.parse(data))
  .handler(async ({ data }) => {
    const adapter = createAuthAdapter({
      provider: env.AUTH_PROVIDER || 'custom',
      db: getDb(env.DB),
      cognito:
        env.AUTH_PROVIDER === 'cognito'
          ? {
              region: env.COGNITO_REGION!,
              userPoolId: env.COGNITO_USER_POOL_ID!,
              clientId: env.COGNITO_CLIENT_ID!,
              clientSecret: env.COGNITO_CLIENT_SECRET!,
              accessKeyId: env.COGNITO_ACCESS_KEY_ID!,
              secretAccessKey: env.COGNITO_SECRET_ACCESS_KEY!,
            }
          : undefined,
    });

    await verifyEmailHandler(adapter, data.code, data.email);

    throw redirect({ to: '/app' });
  });

const ResendVerificationSchema = z.object({
  email: z.string().email().optional(),
});

export const resendVerificationCodeFn = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => ResendVerificationSchema.parse(data))
  .handler(async ({ data }) => {
    const adapter = createAuthAdapter({
      provider: env.AUTH_PROVIDER || 'custom',
      db: getDb(env.DB),
      cognito:
        env.AUTH_PROVIDER === 'cognito'
          ? {
              region: env.COGNITO_REGION!,
              userPoolId: env.COGNITO_USER_POOL_ID!,
              clientId: env.COGNITO_CLIENT_ID!,
              clientSecret: env.COGNITO_CLIENT_SECRET!,
              accessKeyId: env.COGNITO_ACCESS_KEY_ID!,
              secretAccessKey: env.COGNITO_SECRET_ACCESS_KEY!,
            }
          : undefined,
    });

    await resendVerificationCodeHandler(adapter, data.email);
  });

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const forgotPasswordFn = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => ForgotPasswordSchema.parse(data))
  .handler(async ({ data }) => {
    const adapter = createAuthAdapter({
      provider: env.AUTH_PROVIDER || 'custom',
      db: getDb(env.DB),
      cognito:
        env.AUTH_PROVIDER === 'cognito'
          ? {
              region: env.COGNITO_REGION!,
              userPoolId: env.COGNITO_USER_POOL_ID!,
              clientId: env.COGNITO_CLIENT_ID!,
              clientSecret: env.COGNITO_CLIENT_SECRET!,
              accessKeyId: env.COGNITO_ACCESS_KEY_ID!,
              secretAccessKey: env.COGNITO_SECRET_ACCESS_KEY!,
            }
          : undefined,
    });

    await forgotPasswordHandler(adapter, data.email);
  });

const ResetPasswordSchema = z.object({
  email: z.string().email().optional(),
  code: z.string().min(1),
  password: z.string().min(8),
});

export const resetPasswordFn = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => ResetPasswordSchema.parse(data))
  .handler(async ({ data }) => {
    const adapter = createAuthAdapter({
      provider: env.AUTH_PROVIDER || 'custom',
      db: getDb(env.DB),
      cognito:
        env.AUTH_PROVIDER === 'cognito'
          ? {
              region: env.COGNITO_REGION!,
              userPoolId: env.COGNITO_USER_POOL_ID!,
              clientId: env.COGNITO_CLIENT_ID!,
              clientSecret: env.COGNITO_CLIENT_SECRET!,
              accessKeyId: env.COGNITO_ACCESS_KEY_ID!,
              secretAccessKey: env.COGNITO_SECRET_ACCESS_KEY!,
            }
          : undefined,
    });

    await resetPasswordHandler(adapter, {
      email: data.email,
      code: data.code,
      newPassword: data.password,
    });
  });
