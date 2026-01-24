import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { redirect } from '@tanstack/react-router'

import { getDb } from '../lib/db'
import { createMonitor, deleteMonitor, listMonitors } from '../repositories/monitors'
import { getMonitorMetrics } from '../repositories/metrics'
import { clampInt } from '../lib/utils'
import { useAppSession } from '../lib/session'

const authMiddleware = createServerFn().handler(async () => {
    const session = await useAppSession();
    if (!session.data.userId) {
        throw redirect({ to: '/login' });
    }
    return session.data.userId;
});

const CreateMonitorSchema = z.object({
    name: z.string().min(1),
    url: z.string().url(),
    interval_seconds: z.number().int(),
    timeout_ms: z.number().int(),
    failure_threshold: z.number().int(),
});

export const listMonitorsFn = createServerFn({ method: "GET" })
    .handler(async () => {
        await authMiddleware();
        const vars = env;
        const db = getDb(vars.DB);
        const monitors = await listMonitors(db, vars.PUBLIC_TEAM_ID);
        return { monitors };
    });

export const createMonitorFn = createServerFn({ method: "POST" })
    .inputValidator((data: unknown) => CreateMonitorSchema.parse(data))
    .handler(async ({ data }) => {
        await authMiddleware();
        const vars = env;
        const db = getDb(vars.DB);

        const interval_seconds = clampInt(data.interval_seconds, 30, 3600, 60);
        const timeout_ms = clampInt(data.timeout_ms, 1000, 30000, 8000);
        const failure_threshold = clampInt(data.failure_threshold, 1, 10, 3);

        const created = await createMonitor(db, vars.PUBLIC_TEAM_ID, {
            ...data,
            interval_seconds,
            timeout_ms,
            failure_threshold,
        });
        return { ok: true, ...created };
    });

export const deleteMonitorFn = createServerFn({ method: "POST" })
    .inputValidator((data: { id: string }) => data)
    .handler(async ({ data }) => {
        await authMiddleware();
        const vars = env;
        const db = getDb(vars.DB);
        await deleteMonitor(db, vars.PUBLIC_TEAM_ID, data.id);
        return { ok: true };
    });

export const getMonitorMetricsFn = createServerFn({ method: "GET" })
    .inputValidator((data: { monitorId: string; hours?: number }) => data)
    .handler(async ({ data }) => {
        await authMiddleware();
        const vars = env;

        try {
            const hours = Math.min(Math.max(data.hours || 24, 1), 168);
            const result = await getMonitorMetrics(
                vars.CLOUDFLARE_ACCOUNT_ID,
                vars.CLOUDFLARE_API_TOKEN,
                data.monitorId,
                hours,
            );
            return result;
        } catch (error) {
            console.error("Failed to fetch metrics", error);
            throw new Error("Failed to fetch metrics");
        }
    });
