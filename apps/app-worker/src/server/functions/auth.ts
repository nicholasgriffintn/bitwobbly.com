import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { z } from 'zod'

import { getDb } from '../lib/db'
import { authenticateUser, createUser, getUserById, createSession } from '../repositories/auth'
import { useAppSession } from '../lib/session'

const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteCode: z.string().min(1),
});

const SignInSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
})

export const signUpFn = createServerFn({ method: "POST" })
    .inputValidator((data: unknown) => SignUpSchema.parse(data))
    .handler(async ({ data }) => {
        const vars = env;

        if (data.inviteCode !== vars.INVITE_CODE) {
          throw new Error('Invalid invite code');
        }

        const db = getDb(vars.DB);
        const userEmail = data.email;
        const userPass = data.password;

        const { user } = await createUser(db, {
            email: userEmail,
            password: userPass,
        });

        await createSession(db, user.id);

        const session = await useAppSession();
        await session.update({
            userId: user.id,
            email: user.email,
        });

        throw redirect({ to: '/onboarding' });
    });

export const signInFn = createServerFn({ method: "POST" })
    .inputValidator((data: unknown) => SignInSchema.parse(data))
    .handler(async ({ data }) => {
        const vars = env;
        const db = getDb(vars.DB);
        const userEmail = data.email;
        const userPass = data.password;

        const { user } = await authenticateUser(db, userEmail, userPass);

        await createSession(db, user.id);

        const session = await useAppSession();
        await session.update({
            userId: user.id,
            email: user.email,
        });

        throw redirect({ to: '/app' });
    });

export const signOutFn = createServerFn({ method: "POST" })
    .handler(async () => {
        const session = await useAppSession();
        await session.clear();
        throw redirect({ to: '/login' });
    });

export const getCurrentUserFn = createServerFn({ method: "GET" })
    .handler(async () => {
        const session = await useAppSession();
        const userId = session.data.userId;

        if (!userId) {
            return null;
        }

        const vars = env;
        const db = getDb(vars.DB);

        const user = await getUserById(db, userId);

        return user;
    });
