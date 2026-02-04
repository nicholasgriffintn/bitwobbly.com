import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "../lib/db";
import { hashPassword } from "../lib/auth";
import {
  createStatusPage,
  updateStatusPage,
  deleteStatusPage,
  listStatusPages,
  getStatusPageById,
  getStatusPageBySlug,
} from "../repositories/status-pages";
import {
  getPublicStatusSnapshotCacheKey,
  getTeamStatusSnapshotCacheKey,
} from "../lib/status-snapshot-cache";
import { rebuildStatusSnapshot } from "../services/status-snapshots";
import { requireTeam } from "../lib/auth-middleware";

const StatusPageAccessModeSchema = z.enum(["public", "private", "internal"]);
type StatusPageAccessMode = z.infer<typeof StatusPageAccessModeSchema>;

function toStatusPageAccessMode(mode: string): StatusPageAccessMode {
  if (mode === "public" || mode === "private" || mode === "internal")
    return mode;
  return "public";
}

const CreateStatusPageSchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
  access_mode: StatusPageAccessModeSchema.optional().default("public"),
  password: z.string().optional(),
  logo_url: z.string().optional(),
  brand_color: z.string().optional(),
  custom_css: z.string().optional(),
});

const UpdateStatusPageSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{2,60}$/)
    .optional(),
  access_mode: StatusPageAccessModeSchema.optional(),
  password: z.string().optional(),
  logo_url: z.string().nullable().optional(),
  brand_color: z.string().optional(),
  custom_css: z.string().nullable().optional(),
});

export const listStatusPagesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const rows = await listStatusPages(db, teamId);
    const status_pages = rows.map((p) => ({
      id: p.id,
      team_id: p.teamId,
      slug: p.slug,
      name: p.name,
      access_mode: toStatusPageAccessMode(p.accessMode),
      logo_url: p.logoUrl,
      brand_color: p.brandColor,
      custom_css: p.customCss,
      created_at: p.createdAt,
    }));
    return { status_pages };
  }
);

export const createStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateStatusPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    if (data.access_mode === "private") {
      if (!data.password?.trim() || data.password.trim().length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
    }

    const created = await createStatusPage(db, teamId, {
      ...data,
      access_mode: data.access_mode,
      password_hash:
        data.access_mode === "private"
          ? await hashPassword(data.password!.trim())
          : null,
      logo_url: data.logo_url?.trim() || undefined,
      brand_color: data.brand_color?.trim() || "#007bff",
      custom_css: data.custom_css?.trim() || undefined,
    });

    await rebuildStatusSnapshot(
      db,
      vars.KV,
      data.slug,
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
      { teamId, includePrivate: true }
    );

    return { ok: true, ...created };
  });

export const updateStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateStatusPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const { id, ...updates } = data;
    const page = await getStatusPageById(db, teamId, id);
    if (!page) throw new Error("Status page not found");

    const processedUpdates: Record<string, string | null> = {};
    if (updates.name !== undefined) processedUpdates.name = updates.name;
    if (updates.slug !== undefined) processedUpdates.slug = updates.slug;
    if (updates.access_mode !== undefined) {
      processedUpdates.access_mode = updates.access_mode;
    }
    if (updates.logo_url !== undefined) {
      processedUpdates.logo_url = updates.logo_url?.trim() || null;
    }
    if (updates.brand_color !== undefined) {
      processedUpdates.brand_color = updates.brand_color?.trim() || "#007bff";
    }
    if (updates.custom_css !== undefined) {
      processedUpdates.custom_css = updates.custom_css?.trim() || null;
    }

    const nextAccessMode =
      updates.access_mode !== undefined ? updates.access_mode : page.accessMode;

    if (nextAccessMode === "private") {
      const wantsNewPassword = !!updates.password?.trim();
      const isBecomingPrivate =
        page.accessMode !== "private" && updates.access_mode === "private";

      if (isBecomingPrivate && !wantsNewPassword) {
        throw new Error("Password must be at least 8 characters");
      }

      if (wantsNewPassword) {
        if (updates.password!.trim().length < 8) {
          throw new Error("Password must be at least 8 characters");
        }
        processedUpdates.password_hash = await hashPassword(
          updates.password!.trim()
        );
      }
    } else {
      // Leaving private mode clears the password.
      if (page.accessMode === "private") {
        processedUpdates.password_hash = null;
      }
    }

    await updateStatusPage(db, teamId, id, processedUpdates);

    const newSlug = updates.slug || page.slug;
    await rebuildStatusSnapshot(
      db,
      vars.KV,
      newSlug,
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
      { teamId, includePrivate: true }
    );

    if (updates.slug && updates.slug !== page.slug) {
      await vars.KV.delete(getTeamStatusSnapshotCacheKey(teamId, page.slug));
      await vars.KV.delete(getPublicStatusSnapshotCacheKey(page.slug));
    }

    await vars.KV.delete(getPublicStatusSnapshotCacheKey(newSlug));
    return { ok: true };
  });

export const deleteStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const page = await getStatusPageById(db, teamId, data.id);
    if (!page) throw new Error("Status page not found");

    await deleteStatusPage(db, teamId, data.id);
    await vars.KV.delete(getTeamStatusSnapshotCacheKey(teamId, page.slug));
    await vars.KV.delete(getPublicStatusSnapshotCacheKey(page.slug));

    return { ok: true };
  });

export const rebuildStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const page = await getStatusPageBySlug(db, teamId, data.slug);
    if (!page) throw new Error("Status page not found");

    const snapshot = await rebuildStatusSnapshot(
      db,
      vars.KV,
      data.slug,
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
      { teamId, includePrivate: true }
    );
    return { ok: true, snapshot };
  });
