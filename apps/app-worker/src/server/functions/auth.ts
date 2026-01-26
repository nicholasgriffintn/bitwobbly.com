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
} from "@bitwobbly/auth/server";

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

    if (response.requiresMFA) {
      throw redirect({ to: `/mfa-challenge` });
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

    const user = await getCurrentUserHandler(adapter);

    return user;
  },
);
