import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "../lib/db";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  updateMonitor,
  updateMonitorStatus,
} from "../repositories/monitors";
import { getMonitorMetrics } from "../repositories/metrics";
import { clampInt } from "../lib/utils";
import { requireTeam } from "../lib/auth-middleware";
import { generateWebhookToken, hashWebhookToken } from "@bitwobbly/shared";

const CreateMonitorSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().optional(),
    interval_seconds: z.number().int(),
    timeout_ms: z.number().int(),
    failure_threshold: z.number().int(),
    type: z.enum(["http", "webhook", "external", "manual"]).optional(),
    external_config: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.type === "http" || data.type === "external") {
        return data.url && z.string().url().safeParse(data.url).success;
      }
      return true;
    },
    {
      message:
        "URL is required and must be valid for HTTP and external monitors",
      path: ["url"],
    },
  );

export const listMonitorsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const monitors = await listMonitors(db, teamId);
    return { monitors };
  },
);

export const createMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const interval_seconds = clampInt(data.interval_seconds, 30, 3600, 60);
    const timeout_ms = clampInt(data.timeout_ms, 1000, 30000, 8000);
    const failure_threshold = clampInt(data.failure_threshold, 1, 10, 3);

    let webhookToken: string | undefined;
    let webhookTokenHash: string | undefined;

    if (data.type === "webhook") {
      webhookToken = generateWebhookToken();
      webhookTokenHash = await hashWebhookToken(webhookToken);
    }

    const created = await createMonitor(db, teamId, {
      ...data,
      interval_seconds,
      timeout_ms,
      failure_threshold,
      type: data.type || "http",
      webhook_token: webhookTokenHash,
      external_config: data.external_config,
    });

    return {
      ok: true,
      id: created.id,
      webhookToken: data.type === "webhook" ? webhookToken : undefined,
    };
  });

export const deleteMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteMonitor(db, teamId, data.id);
    return { ok: true };
  });

export const getMonitorMetricsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { monitorId: string; hours?: number }) => data)
  .handler(async ({ data }) => {
    await requireTeam();
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
  type: z.enum(["http", "webhook", "external", "manual"]).optional(),
  external_config: z.string().optional(),
});

export const updateMonitorFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateMonitorSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
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
    if (data.type !== undefined) updates.type = data.type;
    if (data.external_config !== undefined)
      updates.external_config = data.external_config;

    await updateMonitor(db, teamId, data.id, updates);
    return { ok: true };
  });

export const triggerSchedulerFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireTeam();
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
  },
);

const SetManualStatusSchema = z.object({
  monitorId: z.string(),
  status: z.enum(["up", "down", "degraded"]),
  message: z.string().optional(),
});

export const setManualMonitorStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SetManualStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    await updateMonitorStatus(
      db,
      teamId,
      data.monitorId,
      data.status,
      data.message,
    );

    return { ok: true };
  });
