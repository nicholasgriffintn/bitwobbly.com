import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { redirect } from "@tanstack/react-router";

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
import { useAppSession } from "../lib/session";

const authMiddleware = createServerFn().handler(async () => {
  const session = await useAppSession();
  if (!session.data.userId) {
    throw redirect({ to: "/login" });
  }
  return session.data.userId;
});

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
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    const status_pages = await listStatusPages(db, vars.PUBLIC_TEAM_ID);
    return { status_pages };
  },
);

export const createStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateStatusPageSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);

    const created = await createStatusPage(db, vars.PUBLIC_TEAM_ID, {
      ...data,
      logo_url: data.logo_url?.trim() || undefined,
      brand_color: data.brand_color?.trim() || "#007bff",
      custom_css: data.custom_css?.trim() || undefined,
    });

    await rebuildStatusSnapshot(
      db,
      vars.KV,
      vars.PUBLIC_TEAM_ID,
      data.slug,
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
    );

    return { ok: true, ...created };
  });

export const updateStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateStatusPageSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);

    const { id, ...updates } = data;
    const page = await getStatusPageById(db, vars.PUBLIC_TEAM_ID, id);
    if (!page) throw new Error("Status page not found");

    const processedUpdates: any = {};
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

    await updateStatusPage(db, vars.PUBLIC_TEAM_ID, id, processedUpdates);

    const newSlug = updates.slug || page.slug;
    await rebuildStatusSnapshot(
      db,
      vars.KV,
      vars.PUBLIC_TEAM_ID,
      newSlug,
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
    );

    if (updates.slug && updates.slug !== page.slug) {
      await vars.KV.delete(`status:${page.slug}`);
    }

    return { ok: true };
  });

export const deleteStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);

    const page = await getStatusPageById(db, vars.PUBLIC_TEAM_ID, data.id);
    if (!page) throw new Error("Status page not found");

    await deleteStatusPage(db, vars.PUBLIC_TEAM_ID, data.id);
    await vars.KV.delete(`status:${page.slug}`);

    return { ok: true };
  });

export const rebuildStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);

    const page = await getStatusPageBySlug(db, vars.PUBLIC_TEAM_ID, data.slug);
    if (!page) throw new Error("Status page not found");

    const snapshot = await rebuildStatusSnapshot(
      db,
      vars.KV,
      vars.PUBLIC_TEAM_ID,
      data.slug,
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
    );
    return { ok: true, snapshot };
  });
