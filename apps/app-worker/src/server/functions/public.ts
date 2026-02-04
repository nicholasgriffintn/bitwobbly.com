import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { notFound } from "@tanstack/react-router";

import { getDb } from "../lib/db";
import { isStatusSnapshot } from "../lib/type-guards";
import {
  getPublicStatusSnapshotCacheKey,
  getTeamStatusSnapshotCacheKey,
} from "../lib/status-snapshot-cache";
import {
  getStatusPageBySlug,
  publicStatusPageExistsBySlug,
} from "../repositories/status-pages";
import { rebuildStatusSnapshot, type StatusSnapshot } from "../services/status-snapshots";
import { requireTeam } from "../lib/auth-middleware";

export const getPublicStatusFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { slug: string }) => {
    return data;
  })
  .handler(async ({ data }): Promise<StatusSnapshot> => {
    const vars = env;

    const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
      key: `status_page:${data.slug}`,
    });

    if (!success) {
      throw new Error('Rate limit exceeded');
    }

    const db = getDb(vars.DB);
    const isPublic = await publicStatusPageExistsBySlug(db, data.slug);
    if (isPublic) {
      const cached = await vars.KV.get(
        getPublicStatusSnapshotCacheKey(data.slug),
        'json',
      );
      if (isStatusSnapshot(cached)) {
        return cached;
      }

      const snapshot = await rebuildStatusSnapshot(
        db,
        vars.KV,
        data.slug,
        vars.CLOUDFLARE_ACCOUNT_ID,
        vars.CLOUDFLARE_API_TOKEN,
      );

      if (!snapshot) {
        throw notFound();
      }

      return snapshot;
    }

    const { teamId } = await requireTeam();
    const page = await getStatusPageBySlug(db, teamId, data.slug);
    if (!page) {
      throw notFound();
    }

    const cached = await vars.KV.get(
      getTeamStatusSnapshotCacheKey(teamId, data.slug),
      'json',
    );
    if (isStatusSnapshot(cached)) {
      return cached;
    }

    const snapshot = await rebuildStatusSnapshot(
      db,
      vars.KV,
      data.slug,
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
      { teamId, includePrivate: true },
    );

    if (!snapshot) {
      throw notFound();
    }

    return snapshot;
  });
