import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "../lib/db";
import {
  createStatusPage,
  updateStatusPage,
  deleteStatusPage,
  listStatusPages,
  getStatusPageById,
  rebuildStatusSnapshot,
  getStatusPageBySlug,
} from "../repositories/status-pages";
import { requireTeam } from "../lib/auth-middleware";

const CreateStatusPageSchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/),
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
  logo_url: z.string().nullable().optional(),
  brand_color: z.string().optional(),
  custom_css: z.string().nullable().optional(),
});

export const listStatusPagesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const status_pages = await listStatusPages(db, teamId);
    return { status_pages };
  },
);

export const createStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateStatusPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const created = await createStatusPage(db, teamId, {
      ...data,
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
      { teamId, includePrivate: true },
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
    if (updates.logo_url !== undefined) {
      processedUpdates.logo_url = updates.logo_url?.trim() || null;
    }
    if (updates.brand_color !== undefined) {
      processedUpdates.brand_color = updates.brand_color?.trim() || "#007bff";
    }
    if (updates.custom_css !== undefined) {
      processedUpdates.custom_css = updates.custom_css?.trim() || null;
    }

    await updateStatusPage(db, teamId, id, processedUpdates);

    const newSlug = updates.slug || page.slug;
    await rebuildStatusSnapshot(
      db,
      vars.KV,
      newSlug,
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
      { teamId, includePrivate: true },
    );

    if (updates.slug && updates.slug !== page.slug) {
      await vars.KV.delete(`status:${page.slug}`);
    }

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
    await vars.KV.delete(`status:${page.slug}`);

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
      { teamId, includePrivate: true },
    );
    return { ok: true, snapshot };
  });
