import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { redirect } from "@tanstack/react-router";

import { getDb } from "../lib/db";
import {
  listComponents,
  createComponent,
  deleteComponent,
  linkMonitorToComponent,
  unlinkMonitorFromComponent,
  linkComponentToStatusPage,
  unlinkComponentFromStatusPage,
  getComponentsForStatusPage,
} from "../repositories/components";
import { useAppSession } from "../lib/session";

const authMiddleware = createServerFn().handler(async () => {
  const session = await useAppSession();
  if (!session.data.userId) {
    throw redirect({ to: "/login" });
  }
  return session.data.userId;
});

const CreateComponentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const LinkMonitorSchema = z.object({
  componentId: z.string(),
  monitorId: z.string(),
});

const LinkToPageSchema = z.object({
  statusPageId: z.string(),
  componentId: z.string(),
  sortOrder: z.number().optional(),
});

export const listComponentsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    const components = await listComponents(db, vars.PUBLIC_TEAM_ID);
    return { components };
  },
);

export const createComponentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateComponentSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    const created = await createComponent(db, vars.PUBLIC_TEAM_ID, data);
    return { ok: true, ...created };
  });

export const deleteComponentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteComponent(db, vars.PUBLIC_TEAM_ID, data.id);
    return { ok: true };
  });

export const linkMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    await linkMonitorToComponent(db, data.componentId, data.monitorId);
    return { ok: true };
  });

export const unlinkMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    await unlinkMonitorFromComponent(db, data.componentId, data.monitorId);
    return { ok: true };
  });

export const linkToPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkToPageSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    await linkComponentToStatusPage(
      db,
      data.statusPageId,
      data.componentId,
      data.sortOrder || 0,
    );
    return { ok: true };
  });

export const unlinkFromPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ statusPageId: z.string(), componentId: z.string() }).parse(data),
  )
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    await unlinkComponentFromStatusPage(
      db,
      data.statusPageId,
      data.componentId,
    );
    return { ok: true };
  });

export const getPageComponentsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { statusPageId: string }) => data)
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    const components = await getComponentsForStatusPage(db, data.statusPageId);
    return { components };
  });
