import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import {
  getTeamAiAssistantSettings,
  listTeamAiAssistantRuns,
  upsertTeamAiAssistantSettings,
} from "@bitwobbly/shared";
import { getDb } from "@bitwobbly/shared";
import { requireTeam } from "../lib/auth-middleware";
import {
  runAssistantOnce,
  toAiAssistantClientRun,
} from "../lib/ai-assistant-runtime";

const UpdateAiAssistantSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    model: z.string().min(1).max(120).optional(),
    autoAuditEnabled: z.boolean().optional(),
    autoAuditIntervalMinutes: z.number().int().min(15).max(10_080).optional(),
    manualAuditRateLimitPerHour: z.number().int().min(1).max(60).optional(),
    autoActionsEnabled: z.boolean().optional(),
    executionMode: z
      .enum(["risk_based", "approval_required", "auto"])
      .optional(),
    lowRiskAutoEnabled: z.boolean().optional(),
    blockedActionTypes: z
      .array(
        z.enum([
          "monitor_tuning",
          "notification_routing",
          "sentry_grouping_update",
          "incident_runbook_update",
          "github_autofix",
          "run_sql",
          "shell_command",
        ])
      )
      .optional(),
    egressAllowlist: z.array(z.string().min(1).max(255)).optional(),
    githubAutofixEnabled: z.boolean().optional(),
    maxContextItems: z.number().int().min(5).max(100).optional(),
    includeIssues: z.boolean().optional(),
    includeMonitors: z.boolean().optional(),
    includeComponents: z.boolean().optional(),
    includeStatusPages: z.boolean().optional(),
    includeNotifications: z.boolean().optional(),
    includeGroupingRules: z.boolean().optional(),
    customInstructions: z.string().max(4_000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one setting must be updated",
  });

const AskAiAssistantSchema = z.object({
  question: z.string().min(3).max(6_000),
});

const RunAuditSchema = z.object({
  focus: z.string().min(3).max(500).optional(),
});

const ListRunsSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  runTypes: z
    .array(z.enum(["manual_query", "manual_audit", "auto_audit"]))
    .optional(),
});

export const getAiAssistantSettingsFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { teamId } = await requireTeam();
  const db = getDb(env.DB);
  const [settings, latestRuns] = await Promise.all([
    getTeamAiAssistantSettings(db, teamId),
    listTeamAiAssistantRuns(db, teamId, { limit: 30 }),
  ]);
  return {
    settings,
    latestRuns: latestRuns.map((run) => toAiAssistantClientRun(run)),
  };
});

export const updateAiAssistantSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    UpdateAiAssistantSettingsSchema.parse(data)
  )
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const settings = await upsertTeamAiAssistantSettings(db, teamId, data);
    return { settings };
  });

export const listAiAssistantRunsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ListRunsSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const runs = await listTeamAiAssistantRuns(db, teamId, {
      limit: data.limit,
      runTypes: data.runTypes,
    });
    return { runs: runs.map((run) => toAiAssistantClientRun(run)) };
  });

export const askAiAssistantFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AskAiAssistantSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const ai = env.AI;
    return await runAssistantOnce(
      {
        teamId,
        mode: "query",
        runType: "manual_query",
        question: data.question.trim(),
      },
      ai
    );
  });

export const runAiAssistantAuditFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => RunAuditSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();

    const focus = data.focus?.trim();
    const question = focus
      ? `Generate a monitoring and incident-management audit focused on: ${focus}`
      : "Generate a monitoring and incident-management audit with prioritised improvements for monitors, notifications, and issue grouping rules.";

    const ai = env.AI;
    const result = await runAssistantOnce(
      {
        teamId,
        mode: "audit",
        runType: "manual_audit",
        question,
      },
      ai
    );

    return result;
  });
