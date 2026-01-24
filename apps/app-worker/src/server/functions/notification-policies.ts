import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { redirect } from '@tanstack/react-router'

import { getDb } from '../lib/db'
import {
    createNotificationPolicy,
    deleteNotificationPolicy,
    listNotificationPolicies
} from '../repositories/notification-policies'
import { getMonitorById } from '../repositories/monitors'
import { notificationChannelExists } from '../repositories/notification-channels'
import { clampInt } from '../lib/utils'
import { useAppSession } from '../lib/session'

const authMiddleware = createServerFn().handler(async () => {
    const session = await useAppSession();
    if (!session.data.userId) {
        throw redirect({ to: '/login' });
    }
    return session.data.userId;
});

const CreatePolicySchema = z.object({
    monitor_id: z.string(),
    channel_id: z.string(),
    threshold_failures: z.number().optional(),
    notify_on_recovery: z.number().optional(),
});

export const listPoliciesFn = createServerFn({ method: "GET" })
    .handler(async () => {
        await authMiddleware();
        const vars = env;
        const db = getDb(vars.DB);
        const policies = await listNotificationPolicies(db, vars.PUBLIC_TEAM_ID);
        return { policies };
    });

export const createPolicyFn = createServerFn({ method: "POST" })
    .inputValidator((data: unknown) => CreatePolicySchema.parse(data))
    .handler(async ({ data }) => {
        await authMiddleware();
        const vars = env;
        const db = getDb(vars.DB);

        const monitor = await getMonitorById(db, vars.PUBLIC_TEAM_ID, data.monitor_id);
        if (!monitor) throw new Error("Monitor not found");

        const channelExists = await notificationChannelExists(db, vars.PUBLIC_TEAM_ID, data.channel_id);
        if (!channelExists) throw new Error("Notification channel not found");

        const threshold_failures = clampInt(data.threshold_failures || 3, 1, 10, 3);
        const notify_on_recovery = data.notify_on_recovery === 0 ? 0 : 1;

        const created = await createNotificationPolicy(db, vars.PUBLIC_TEAM_ID, {
            monitor_id: data.monitor_id,
            channel_id: data.channel_id,
            threshold_failures,
            notify_on_recovery,
        });

        return { ok: true, ...created };
    });

export const deletePolicyFn = createServerFn({ method: "POST" })
    .inputValidator((data: { id: string }) => data)
    .handler(async ({ data }) => {
        await authMiddleware();
        const vars = env;
        const db = getDb(vars.DB);
        await deleteNotificationPolicy(db, vars.PUBLIC_TEAM_ID, data.id);
        return { ok: true };
    });
