import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { z } from 'zod'

import { getDb } from '../lib/db'
import { authenticateUser, createUser, getUserById } from '../repositories/auth'
import { createSession } from '../repositories/auth'
import { useAppSession } from '../lib/session'

const SignUpSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
})

const SignInSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
})

export const signUpFn = createServerFn({ method: "POST" })
    .inputValidator((data: unknown) => SignUpSchema.parse(data))
    .handler(async ({ data }) => {
        const vars = env;
        const db = getDb(vars.DB);

        const { user } = await createUser(db, {
            email: data.email,
            password: data.password,
            team_id: vars.PUBLIC_TEAM_ID,
        });

        await createSession(db, user.id);

        const session = await useAppSession();
        await session.update({
            userId: user.id,
            email: user.email,
        });

        throw redirect({ to: '/app' });
    });

export const signInFn = createServerFn({ method: "POST" })
    .inputValidator((data: unknown) => SignInSchema.parse(data))
    .handler(async ({ data }) => {
        const vars = env;
        const db = getDb(vars.DB);

        const { user } = await authenticateUser(db, data.email, data.password);

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
