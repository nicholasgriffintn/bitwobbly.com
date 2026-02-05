import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { getDb } from "@bitwobbly/shared";

import {
  listAlertRules,
  getAlertRuleById,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  toggleAlertRule,
  listAlertRuleFires,
} from "../repositories/alert-rules";
import { notificationChannelExists } from "../repositories/notification-channels";
import { getMonitorById } from "../repositories/monitors";
import { requireTeam } from "../lib/auth-middleware";

const ThresholdSchema = z.object({
  type: z.enum(["static", "percent_change"]),
  windowSeconds: z.number().min(60).max(86400),
  metric: z.enum(["count", "count_unique_users", "avg_events_per_hour"]),
  critical: z.number().min(1),
  warning: z.number().optional(),
  resolved: z.number().optional(),
  comparisonWindow: z.enum(["1h", "1d", "1w", "30d"]).optional(),
});

const ConditionsSchema = z.object({
  level: z.array(z.enum(["error", "warning", "info", "debug"])).optional(),
  environment: z.array(z.string()).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  issueAge: z.string().optional(),
  release: z.string().optional(),
  eventType: z.array(z.enum(["error", "default"])).optional(),
});

const CreateAlertRuleSchema = z
  .object({
    name: z.string().min(1).max(100),
    enabled: z.number().optional(),
    sourceType: z.enum(["issue", "monitor"]),
    projectId: z.string().optional().nullable(),
    monitorId: z.string().optional().nullable(),
    environment: z.string().optional().nullable(),
    triggerType: z.enum([
      "new_issue",
      "issue_regression",
      "event_threshold",
      "user_threshold",
      "status_change",
      "high_priority",
      "monitor_down",
      "monitor_recovery",
    ]),
    conditions: ConditionsSchema.optional().nullable(),
    threshold: ThresholdSchema.optional().nullable(),
    channelId: z.string(),
    actionIntervalSeconds: z.number().min(300).max(86400).optional(),
    ownerId: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.sourceType === "monitor" && !data.monitorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "monitorId is required for monitor rules",
        path: ["monitorId"],
      });
    }

    if (data.sourceType === "monitor" && data.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is not valid for monitor rules",
        path: ["projectId"],
      });
    }

    if (data.sourceType === "issue" && data.monitorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "monitorId is not valid for issue rules",
        path: ["monitorId"],
      });
    }
  });

const UpdateAlertRuleSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  enabled: z.number().optional(),
  projectId: z.string().optional().nullable(),
  monitorId: z.string().optional().nullable(),
  environment: z.string().optional().nullable(),
  triggerType: z
    .enum([
      "new_issue",
      "issue_regression",
      "event_threshold",
      "user_threshold",
      "status_change",
      "high_priority",
      "monitor_down",
      "monitor_recovery",
    ])
    .optional(),
  conditions: ConditionsSchema.optional().nullable(),
  threshold: ThresholdSchema.optional().nullable(),
  channelId: z.string().optional(),
  actionIntervalSeconds: z.number().min(300).max(86400).optional(),
  ownerId: z.string().optional().nullable(),
});

export const listAlertRulesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const rules = await listAlertRules(db, teamId);
    return { rules };
  }
);

export const getAlertRuleFn = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const rule = await getAlertRuleById(db, teamId, data.id);
    if (!rule) throw new Error("Alert rule not found");
    return { rule };
  });

export const createAlertRuleFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateAlertRuleSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const channelExists = await notificationChannelExists(
      db,
      teamId,
      data.channelId
    );
    if (!channelExists) throw new Error("Notification channel not found");

    if (data.sourceType === "monitor" && data.monitorId) {
      const monitor = await getMonitorById(db, teamId, data.monitorId);
      if (!monitor) {
        throw new Error("Monitor not found");
      }
    }

    const created = await createAlertRule(db, teamId, {
      name: data.name,
      enabled: data.enabled,
      sourceType: data.sourceType,
      projectId: data.projectId,
      monitorId: data.monitorId,
      environment: data.environment,
      triggerType: data.triggerType,
      conditionsJson: data.conditions ? JSON.stringify(data.conditions) : null,
      thresholdJson: data.threshold ? JSON.stringify(data.threshold) : null,
      channelId: data.channelId,
      actionIntervalSeconds: data.actionIntervalSeconds,
      ownerId: data.ownerId,
    });

    return { ok: true, ...created };
  });

export const updateAlertRuleFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateAlertRuleSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const existing = await getAlertRuleById(db, teamId, data.id);
    if (!existing) throw new Error("Alert rule not found");

    if (
      existing.sourceType === "monitor" &&
      data.projectId !== undefined &&
      data.projectId !== null
    ) {
      throw new Error("projectId is not valid for monitor rules");
    }

    if (
      existing.sourceType === "issue" &&
      data.monitorId !== undefined &&
      data.monitorId !== null
    ) {
      throw new Error("monitorId is not valid for issue rules");
    }

    if (existing.sourceType === "monitor" && data.monitorId === null) {
      throw new Error("monitorId is required for monitor rules");
    }

    if (data.channelId) {
      const channelExists = await notificationChannelExists(
        db,
        teamId,
        data.channelId
      );
      if (!channelExists) throw new Error("Notification channel not found");
    }

    if (data.monitorId !== undefined && data.monitorId !== null) {
      const monitor = await getMonitorById(db, teamId, data.monitorId);
      if (!monitor) {
        throw new Error("Monitor not found");
      }
    }

    await updateAlertRule(db, teamId, data.id, {
      name: data.name,
      enabled: data.enabled,
      projectId: data.projectId,
      monitorId: data.monitorId,
      environment: data.environment,
      triggerType: data.triggerType,
      conditionsJson: data.conditions ? JSON.stringify(data.conditions) : null,
      thresholdJson: data.threshold ? JSON.stringify(data.threshold) : null,
      channelId: data.channelId,
      actionIntervalSeconds: data.actionIntervalSeconds,
      ownerId: data.ownerId,
    });

    return { ok: true };
  });

export const deleteAlertRuleFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteAlertRule(db, teamId, data.id);
    return { ok: true };
  });

export const toggleAlertRuleFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; enabled: boolean }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await toggleAlertRule(db, teamId, data.id, data.enabled);
    return { ok: true };
  });

export const listAlertRuleFiresFn = createServerFn({ method: "GET" })
  .inputValidator((data: { ruleId?: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const fires = await listAlertRuleFires(
      db,
      teamId,
      data.ruleId,
      data.limit || 50
    );
    return { fires };
  });
