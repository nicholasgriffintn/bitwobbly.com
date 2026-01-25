import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { redirect } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { schema } from "@bitwobbly/shared";

import { getDb } from "../lib/db";
import {
  listComponents,
  createComponent,
  updateComponent,
  deleteComponent,
  linkMonitorToComponent,
  unlinkMonitorFromComponent,
  linkComponentToStatusPage,
  unlinkComponentFromStatusPage,
  getComponentsForStatusPage,
} from "../repositories/components";
import {
  getStatusPageById,
  clearAllStatusPageCaches,
} from "../repositories/status-pages";
import {
  getComponentUptimeMetrics,
  getComponentMetrics,
} from "../repositories/metrics";
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

const UpdateComponentSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
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

export const updateComponentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateComponentSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    const { id, ...updates } = data;
    await updateComponent(db, vars.PUBLIC_TEAM_ID, id, updates);

    await clearAllStatusPageCaches(db, vars.KV, vars.PUBLIC_TEAM_ID);

    return { ok: true };
  });

export const deleteComponentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteComponent(db, vars.PUBLIC_TEAM_ID, data.id);

    await clearAllStatusPageCaches(db, vars.KV, vars.PUBLIC_TEAM_ID);

    return { ok: true };
  });

export const linkMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    await linkMonitorToComponent(db, data.componentId, data.monitorId);

    await clearAllStatusPageCaches(db, vars.KV, vars.PUBLIC_TEAM_ID);

    return { ok: true };
  });

export const unlinkMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    await unlinkMonitorFromComponent(db, data.componentId, data.monitorId);

    await clearAllStatusPageCaches(db, vars.KV, vars.PUBLIC_TEAM_ID);

    return { ok: true };
  });

export const linkToPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkToPageSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);

    const page = await getStatusPageById(
      db,
      vars.PUBLIC_TEAM_ID,
      data.statusPageId,
    );
    if (!page) throw new Error("Status page not found");

    await linkComponentToStatusPage(
      db,
      data.statusPageId,
      data.componentId,
      data.sortOrder || 0,
    );

    await vars.KV.delete(`status:${page.slug}`);

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

    const page = await getStatusPageById(
      db,
      vars.PUBLIC_TEAM_ID,
      data.statusPageId,
    );
    if (!page) throw new Error("Status page not found");

    await unlinkComponentFromStatusPage(
      db,
      data.statusPageId,
      data.componentId,
    );

    await vars.KV.delete(`status:${page.slug}`);

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

const GetComponentUptimeSchema = z.object({
  componentId: z.string(),
  period: z.enum(["7d", "30d", "90d"]).default("7d"),
});

const GetComponentMetricsSchema = z.object({
  componentId: z.string(),
  from: z.number(),
  to: z.number(),
});

export const getComponentUptimeFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetComponentUptimeSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);

    const component = await db
      .select()
      .from(schema.components)
      .where(eq(schema.components.id, data.componentId))
      .limit(1);

    if (!component.length) {
      throw new Error("Component not found");
    }

    const links = await db
      .select()
      .from(schema.componentMonitors)
      .where(eq(schema.componentMonitors.componentId, data.componentId));

    const monitorIds = links.map((l) => l.monitorId);
    const periodDays =
      data.period === "7d" ? 7 : data.period === "30d" ? 30 : 90;

    const uptime = await getComponentUptimeMetrics(
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
      monitorIds,
      periodDays,
    );

    return uptime;
  });

export const getComponentMetricsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetComponentMetricsSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);

    const component = await db
      .select()
      .from(schema.components)
      .where(eq(schema.components.id, data.componentId))
      .limit(1);

    if (!component.length) {
      throw new Error("Component not found");
    }

    const links = await db
      .select()
      .from(schema.componentMonitors)
      .where(eq(schema.componentMonitors.componentId, data.componentId));

    const monitorIds = links.map((l) => l.monitorId);

    const metrics = await getComponentMetrics(
      vars.CLOUDFLARE_ACCOUNT_ID,
      vars.CLOUDFLARE_API_TOKEN,
      data.componentId,
      component[0].name,
      monitorIds,
      data.from,
      data.to,
    );

    return metrics;
  });
