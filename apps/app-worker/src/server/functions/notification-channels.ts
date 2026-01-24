import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { redirect } from '@tanstack/react-router'

import { getDb } from '../lib/db'
import {
    createEmailChannel,
    createWebhookChannel,
    deleteNotificationChannel,
    listNotificationChannels
} from '../repositories/notification-channels'
import { useAppSession } from '../lib/session'

const authMiddleware = createServerFn().handler(async () => {
    const session = await useAppSession();
    if (!session.data.userId) {
        throw redirect({ to: '/login' });
    }
    return session.data.userId;
});

const CreateChannelSchema = z.object({
    type: z.enum(['webhook', 'email']),
    url: z.string().url().optional(),
    to: z.string().email().optional(),
    from: z.string().optional(),
    subject: z.string().optional(),
    label: z.string().optional(),
    enabled: z.number().optional(),
}).refine((data) => {
    if (data.type === 'webhook' && !data.url) return false;
    if (data.type === 'email' && !data.to) return false;
    return true;
}, { message: "Missing required fields for selected type" });

export const listChannelsFn = createServerFn({ method: "GET" })
    .handler(async () => {
        await authMiddleware();
        const vars = env;
        const db = getDb(vars.DB);
        const channels = await listNotificationChannels(db, vars.PUBLIC_TEAM_ID);
        return { channels };
    });

export const createChannelFn = createServerFn({ method: "POST" })
    .inputValidator((data: unknown) => CreateChannelSchema.parse(data))
    .handler(async ({ data }) => {
        await authMiddleware();
        const vars = env;
        const db = getDb(vars.DB);

        let created;
        if (data.type === 'webhook' && data.url) {
            created = await createWebhookChannel(db, vars.PUBLIC_TEAM_ID, {
                url: data.url,
                label: data.label,
                enabled: data.enabled,
            });
        } else if (data.type === 'email' && data.to) {
            created = await createEmailChannel(db, vars.PUBLIC_TEAM_ID, {
                to: data.to,
                from: data.from,
                subject: data.subject,
                label: data.label,
                enabled: data.enabled,
            });
        } else {
            throw new Error("Invalid channel data");
        }

        return { ok: true, ...created };
    });

export const deleteChannelFn = createServerFn({ method: "POST" })
    .inputValidator((data: { id: string }) => data)
    .handler(async ({ data }) => {
        await authMiddleware();
        const vars = env;
        const db = getDb(vars.DB);
        await deleteNotificationChannel(db, vars.PUBLIC_TEAM_ID, data.id);
        return { ok: true };
    });
