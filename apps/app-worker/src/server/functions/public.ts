import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { notFound } from '@tanstack/react-router'

import { getDb } from '../lib/db'
import { rebuildStatusSnapshot } from '../repositories/status-pages'

export const getPublicStatusFn = createServerFn({ method: "GET" })
    .inputValidator((data: { slug: string }) => data)
    .handler(async ({ data }) => {
        const vars = env;

        const cached = await vars.KV.get(`status:${data.slug}`, 'json');
        if (cached) {
            return cached;
        }

        const db = getDb(vars.DB);
        const snapshot = await rebuildStatusSnapshot(
            db,
            vars.KV,
            vars.PUBLIC_TEAM_ID,
            data.slug,
        );

        if (!snapshot) {
            throw notFound();
        }

        return snapshot;
    });
