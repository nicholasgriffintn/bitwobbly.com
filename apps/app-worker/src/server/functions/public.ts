import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "../lib/db";
import { verifyPassword } from "../lib/auth";
import { isStatusSnapshot } from "../lib/type-guards";
import {
  getPublicStatusSnapshotCacheKey,
  getTeamStatusSnapshotCacheKey,
} from "../lib/status-snapshot-cache";
import {
  getStatusPageBySlug,
  getExternalStatusPageBySlug,
} from "../repositories/status-pages";
import {
  isStatusPageUnlocked,
  unlockStatusPage,
  useStatusPageSession,
} from "../lib/status-page-session";
import {
  rebuildStatusSnapshot,
  type StatusSnapshot,
} from "../services/status-snapshots";
import { requireTeam } from "../lib/auth-middleware";

export type PublicStatusResult =
  | { kind: "snapshot"; snapshot: StatusSnapshot }
  | {
      kind: "password_required";
      page: {
        name: string;
        logo_url: string | null;
        brand_color: string | null;
      };
    };

export const getPublicStatusFn = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => {
    return data;
  })
  .handler(async ({ data }): Promise<PublicStatusResult> => {
    const vars = env;

    const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
      key: `status_page:${data.slug}`,
    });

    if (!success) {
      throw new Error("Rate limit exceeded");
    }

    const db = getDb(vars.DB);

    const externalPage = await getExternalStatusPageBySlug(db, data.slug);
    if (externalPage) {
      if (externalPage.accessMode === "private") {
        const session = await useStatusPageSession();
        if (!isStatusPageUnlocked(session, data.slug)) {
          return {
            kind: "password_required",
            page: {
              name: externalPage.name,
              logo_url: externalPage.logoUrl,
              brand_color: externalPage.brandColor,
            },
          };
        }
      }

      const cached = await vars.KV.get(
        getPublicStatusSnapshotCacheKey(data.slug),
        "json"
      );
      if (isStatusSnapshot(cached)) {
        return { kind: "snapshot", snapshot: cached };
      }

      const snapshot = await rebuildStatusSnapshot(
        db,
        vars.KV,
        data.slug,
        vars.CLOUDFLARE_ACCOUNT_ID,
        vars.CLOUDFLARE_API_TOKEN
      );

      if (!snapshot) {
        throw notFound();
      }

      return { kind: "snapshot", snapshot };
    }

    const { teamId } = await requireTeam();
    const page = await getStatusPageBySlug(db, teamId, data.slug);
    if (!page) {
      throw notFound();
    }

    const cached = await vars.KV.get(
      getTeamStatusSnapshotCacheKey(teamId, data.slug),
      "json"
    );
    if (isStatusSnapshot(cached)) {
      return { kind: "snapshot", snapshot: cached };
    }

    const snapshot = await rebuildStatusSnapshot(
      db,
      vars.KV,
      data.slug,
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
      { teamId, includePrivate: true }
    );

    if (!snapshot) {
      throw notFound();
    }

    return { kind: "snapshot", snapshot };
  });

const UnlockPrivateStatusPageSchema = z.object({
  slug: z.string(),
  password: z.string().min(1),
});

export const unlockPrivateStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UnlockPrivateStatusPageSchema.parse(data))
  .handler(async ({ data }) => {
    const vars = env;
    const db = getDb(vars.DB);

    const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
      key: `status_page_unlock:${data.slug}`,
    });
    if (!success) {
      throw new Error("Rate limit exceeded");
    }

    const page = await getExternalStatusPageBySlug(db, data.slug);
    if (!page || page.accessMode !== "private") {
      throw notFound();
    }

    if (!page.passwordHash) {
      throw new Error("This status page is missing a password");
    }

    const ok = await verifyPassword(data.password, page.passwordHash);
    if (!ok) {
      throw new Error("Invalid password");
    }

    const session = await useStatusPageSession();
    await unlockStatusPage(session, data.slug);
    return { ok: true };
  });
