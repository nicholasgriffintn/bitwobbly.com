import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
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
  linkDependency,
  unlinkDependency,
  linkComponentToStatusPage,
  unlinkComponentFromStatusPage,
  getComponentsForStatusPage,
  getComponentById,
} from "../repositories/components";
import { getStatusPageById } from "../repositories/status-pages";
import {
  clearAllStatusPageCaches,
  clearStatusPageCache,
} from "../services/status-snapshots";
import {
  getComponentUptimeMetrics,
  getComponentMetrics,
} from "../repositories/metrics";
import { requireTeam } from "../lib/auth-middleware";

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

const LinkDependencySchema = z.object({
  componentId: z.string(),
  dependsOnComponentId: z.string(),
});

const LinkToPageSchema = z.object({
  statusPageId: z.string(),
  componentId: z.string(),
  sortOrder: z.number().optional(),
});

export const listComponentsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const components = await listComponents(db, teamId);
    return { components };
  }
);

export const createComponentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateComponentSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const created = await createComponent(db, teamId, data);
    return { ok: true, ...created };
  });

export const updateComponentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateComponentSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const { id, ...updates } = data;
    await updateComponent(db, teamId, id, updates);

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true };
  });

export const deleteComponentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteComponent(db, teamId, data.id);

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true };
  });

export const linkMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await linkMonitorToComponent(db, teamId, data.componentId, data.monitorId);

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true };
  });

export const unlinkMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await unlinkMonitorFromComponent(
      db,
      teamId,
      data.componentId,
      data.monitorId
    );

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true };
  });

export const linkDependencyFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkDependencySchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await linkDependency(
      db,
      teamId,
      data.componentId,
      data.dependsOnComponentId
    );

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true };
  });

export const unlinkDependencyFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkDependencySchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await unlinkDependency(
      db,
      teamId,
      data.componentId,
      data.dependsOnComponentId
    );

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true };
  });

export const linkToPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => LinkToPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const page = await getStatusPageById(db, teamId, data.statusPageId);
    if (!page) throw new Error("Status page not found");

    await linkComponentToStatusPage(
      db,
      teamId,
      data.statusPageId,
      data.componentId,
      data.sortOrder || 0
    );

    await clearStatusPageCache(db, vars.KV, teamId, page.id);

    return { ok: true };
  });

export const unlinkFromPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ statusPageId: z.string(), componentId: z.string() }).parse(data)
  )
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const page = await getStatusPageById(db, teamId, data.statusPageId);
    if (!page) throw new Error("Status page not found");

    await unlinkComponentFromStatusPage(
      db,
      teamId,
      data.statusPageId,
      data.componentId
    );

    await clearStatusPageCache(db, vars.KV, teamId, page.id);

    return { ok: true };
  });

export const getPageComponentsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { statusPageId: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const components = await getComponentsForStatusPage(
      db,
      teamId,
      data.statusPageId
    );
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
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const component = await getComponentById(db, teamId, data.componentId);
    if (!component) {
      throw new Error("Component not found or access denied");
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
      periodDays
    );

    return uptime;
  });

export const getComponentMetricsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetComponentMetricsSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const component = await getComponentById(db, teamId, data.componentId);
    if (!component) {
      throw new Error("Component not found or access denied");
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
      component.name,
      monitorIds,
      data.from,
      data.to
    );

    return metrics;
  });
