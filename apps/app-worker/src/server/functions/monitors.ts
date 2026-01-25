import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { redirect } from "@tanstack/react-router";

import { getDb } from "../lib/db";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  updateMonitor,
} from "../repositories/monitors";
import { getMonitorMetrics } from "../repositories/metrics";
import { clampInt } from "../lib/utils";
import { useAppSession } from "../lib/session";

const authMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const session = await useAppSession();
  if (!session.data.userId) {
    throw redirect({ to: "/login" });
  }
  return next({
    context: {
      userId: session.data.userId,
    },
  });
});

const CreateMonitorSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  interval_seconds: z.number().int(),
  timeout_ms: z.number().int(),
  failure_threshold: z.number().int(),
});

export const listMonitorsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const vars = env;
    const db = getDb(vars.DB);
    const monitors = await listMonitors(db, vars.PUBLIC_TEAM_ID);
    return { monitors };
  });

export const createMonitorFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => CreateMonitorSchema.parse(data))
  .handler(async ({ data }) => {
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
  .middleware([authMiddleware])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const vars = env;
    const db = getDb(vars.DB);
    await deleteMonitor(db, vars.PUBLIC_TEAM_ID, data.id);
    return { ok: true };
  });

export const getMonitorMetricsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator((data: { monitorId: string; hours?: number }) => data)
  .handler(async ({ data }) => {
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

const UpdateMonitorSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  interval_seconds: z.number().int().optional(),
  timeout_ms: z.number().int().optional(),
  failure_threshold: z.number().int().optional(),
  enabled: z.number().optional(),
});

export const updateMonitorFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((data: unknown) => UpdateMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    const vars = env;
    const db = getDb(vars.DB);

    const updates: Parameters<typeof updateMonitor>[3] = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.url !== undefined) updates.url = data.url;
    if (data.interval_seconds !== undefined)
      updates.interval_seconds = clampInt(data.interval_seconds, 30, 3600, 60);
    if (data.timeout_ms !== undefined)
      updates.timeout_ms = clampInt(data.timeout_ms, 1000, 30000, 8000);
    if (data.failure_threshold !== undefined)
      updates.failure_threshold = clampInt(data.failure_threshold, 1, 10, 3);
    if (data.enabled !== undefined) updates.enabled = data.enabled;

    await updateMonitor(db, vars.PUBLIC_TEAM_ID, data.id, updates);
    return { ok: true };
  });

export const triggerSchedulerFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    try {
      console.log("[APP] Triggering scheduler...");
      const schedulerUrl = "http://localhost:8788/cdn-cgi/handler/scheduled";
      const response = await fetch(schedulerUrl, { method: "POST" });

      if (!response.ok) {
        throw new Error(`Scheduler returned ${response.status}`);
      }

      console.log("[APP] Scheduler triggered successfully");
      return { ok: true, message: "Scheduler triggered successfully" };
    } catch (error) {
      console.error("[APP] Failed to trigger scheduler:", error);
      throw new Error(
        "Failed to trigger scheduler. Make sure dev server is running.",
      );
    }
  });
