import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "@bitwobbly/shared";
import { requireTeam } from "../lib/auth-middleware";
import {
  createSentryProject,
  listSentryProjects,
  getSentryProject,
  getSentryProjectDsn,
  updateSentryProject,
  deleteSentryProject,
} from "../repositories/sentry-projects";
import {
  listSentryEvents,
  getSentryEvent,
  listSentryIssues,
  getSentryIssue,
  updateSentryIssue,
} from "../repositories/sentry-events";
import {
  getSentryReleaseHealth,
  listSentrySessions,
} from "../repositories/sentry-sessions";
import { listSentryClientReports } from "../repositories/sentry-client-reports";
import {
  createSentryIssueGroupingRule,
  deleteSentryIssueGroupingRule,
  listSentryIssueGroupingRules,
  updateSentryIssueGroupingRule,
} from "../repositories/sentry-issue-grouping-rules";

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  platform: z.string().optional(),
  componentId: z.string().optional(),
});

const UpdateProjectSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).optional(),
  platform: z.string().optional().nullable(),
  componentId: z.string().optional().nullable(),
});

const SentryIssueStatusSchema = z.enum(["unresolved", "resolved", "ignored"]);

const GetProjectDsnSchema = z.object({
  projectId: z.string().min(1),
});

const ListSentryEventsSchema = z.object({
  projectId: z.string().min(1),
  since: z.number().int().positive().optional(),
  until: z.number().int().positive().optional(),
  type: z.string().min(1).optional(),
  issueId: z.string().min(1).optional(),
  release: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  transaction: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

const GetSentryEventPayloadSchema = z.object({
  projectId: z.string().min(1),
  eventId: z.string().min(1),
});

const ListSentrySessionsSchema = z.object({
  projectId: z.string().min(1),
  since: z.number().int().positive().optional(),
  until: z.number().int().positive().optional(),
  release: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

const GetSentryReleaseHealthSchema = z.object({
  projectId: z.string().min(1),
  since: z.number().int().positive().optional(),
  until: z.number().int().positive().optional(),
});

const ListSentryClientReportsSchema = z.object({
  projectId: z.string().min(1),
  since: z.number().int().positive().optional(),
  until: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

const IssueGroupingMatchersSchema = z.object({
  exceptionType: z.string().min(1).optional(),
  level: z.string().min(1).optional(),
  messageIncludes: z.string().min(1).optional(),
  culpritIncludes: z.string().min(1).optional(),
  transactionIncludes: z.string().min(1).optional(),
  frameIncludes: z.string().min(1).optional(),
});

const ListIssueGroupingRulesSchema = z.object({
  projectId: z.string().min(1),
});

const CreateIssueGroupingRuleSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  matchers: IssueGroupingMatchersSchema.nullable().optional(),
  fingerprint: z.string().min(1),
});

const UpdateIssueGroupingRuleSchema = z.object({
  projectId: z.string().min(1),
  ruleId: z.string().min(1),
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  matchers: IssueGroupingMatchersSchema.nullable().optional(),
  fingerprint: z.string().min(1).optional(),
});

const DeleteIssueGroupingRuleSchema = z.object({
  projectId: z.string().min(1),
  ruleId: z.string().min(1),
});

const ListSentryIssuesSchema = z.object({
  projectId: z.string().min(1),
  status: SentryIssueStatusSchema.optional(),
  since: z.number().int().positive().optional(),
  until: z.number().int().positive().optional(),
  query: z.string().min(1).optional(),
  release: z.string().min(1).optional(),
  environment: z.string().min(1).optional(),
  assignedToUserId: z.string().min(1).optional(),
  unassigned: z.boolean().optional(),
  includeSnoozed: z.boolean().optional(),
});

const UpdateSentryIssueSchema = z.object({
  projectId: z.string().min(1),
  issueId: z.string().min(1),
  status: SentryIssueStatusSchema.optional(),
  assignedToUserId: z.string().min(1).nullable().optional(),
  snoozedUntil: z.number().int().positive().nullable().optional(),
  ignoredUntil: z.number().int().positive().nullable().optional(),
  resolvedInRelease: z.string().min(1).nullable().optional(),
});

const GetSentryIssueSchema = z.object({
  projectId: z.string().min(1),
  issueId: z.string().min(1),
});

export const listSentryProjectsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const projects = await listSentryProjects(db, teamId);
    return { projects };
  }
);

export const createSentryProjectFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateProjectSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const result = await createSentryProject(db, teamId, data);
    return { ok: true, ...result };
  });

export const updateSentryProjectFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateProjectSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const { projectId, ...updates } = data;
    const result = await updateSentryProject(db, teamId, projectId, updates);
    if (!result) throw new Error("Project not found");
    return { ok: true, project: result };
  });

export const getSentryProjectDsnFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetProjectDsnSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const ingestHost = "ingest.bitwobbly.com";
    const result = await getSentryProjectDsn(
      db,
      teamId,
      data.projectId,
      ingestHost
    );
    if (!result) throw new Error("Project not found");
    return result;
  });

export const listSentryEventsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ListSentryEventsSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const events = await listSentryEvents(db, data.projectId, {
      since: data.since,
      until: data.until,
      type: data.type,
      issueId: data.issueId,
      release: data.release,
      environment: data.environment,
      transaction: data.transaction,
      query: data.query,
      limit: data.limit,
    });
    return { events };
  });

export const getSentryEventPayloadFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetSentryEventPayloadSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const event = await getSentryEvent(db, data.projectId, data.eventId);
    if (!event) throw new Error("Event not found");

    const obj = await env.SENTRY_RAW.get(event.r2Key);
    if (!obj) throw new Error("Payload not found in storage");

    const payload = await obj.text();
    return { event, payload };
  });

export const listSentryIssueGroupingRulesFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ListIssueGroupingRulesSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const rules = await listSentryIssueGroupingRules(db, data.projectId);
    return { rules };
  });

export const createSentryIssueGroupingRuleFn = createServerFn({
  method: "POST",
})
  .inputValidator((data: unknown) => CreateIssueGroupingRuleSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const rule = await createSentryIssueGroupingRule(db, data.projectId, {
      name: data.name,
      enabled: data.enabled,
      matchers: data.matchers,
      fingerprint: data.fingerprint,
    });

    if (!rule) throw new Error("Could not create rule");
    return { ok: true, rule };
  });

export const updateSentryIssueGroupingRuleFn = createServerFn({
  method: "POST",
})
  .inputValidator((data: unknown) => UpdateIssueGroupingRuleSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const rule = await updateSentryIssueGroupingRule(
      db,
      data.projectId,
      data.ruleId,
      {
        name: data.name,
        enabled: data.enabled,
        matchers: data.matchers,
        fingerprint: data.fingerprint,
      }
    );

    if (!rule) throw new Error("Rule not found");
    return { ok: true, rule };
  });

export const deleteSentryIssueGroupingRuleFn = createServerFn({
  method: "POST",
})
  .inputValidator((data: unknown) => DeleteIssueGroupingRuleSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const ok = await deleteSentryIssueGroupingRule(
      db,
      data.projectId,
      data.ruleId
    );
    if (!ok) throw new Error("Rule not found");
    return { ok: true };
  });

export const listSentrySessionsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ListSentrySessionsSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const sessions = await listSentrySessions(db, data.projectId, {
      since: data.since,
      until: data.until,
      release: data.release,
      environment: data.environment,
      status: data.status,
      limit: data.limit,
    });

    return { sessions };
  });

export const getSentryReleaseHealthFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetSentryReleaseHealthSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const health = await getSentryReleaseHealth(db, data.projectId, {
      since: data.since,
      until: data.until,
    });

    return { health };
  });

export const listSentryClientReportsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ListSentryClientReportsSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const reports = await listSentryClientReports(db, data.projectId, {
      since: data.since,
      until: data.until,
      limit: data.limit,
    });

    return { reports };
  });

export const listSentryIssuesFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ListSentryIssuesSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const issues = await listSentryIssues(db, data.projectId, {
      status: data.status,
      since: data.since,
      until: data.until,
      query: data.query,
      release: data.release,
      environment: data.environment,
      assignedToUserId: data.assignedToUserId,
      unassigned: data.unassigned,
      includeSnoozed: data.includeSnoozed,
    });
    return { issues };
  });

export const deleteSentryProjectFn = createServerFn({ method: "POST" })
  .inputValidator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const result = await deleteSentryProject(db, teamId, data.projectId);
    if (!result) throw new Error("Project not found");
    return { ok: true };
  });

export const updateSentryIssueFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateSentryIssueSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const result = await updateSentryIssue(db, data.projectId, data.issueId, {
      status: data.status,
      assignedToUserId: data.assignedToUserId,
      snoozedUntil: data.snoozedUntil,
      ignoredUntil: data.ignoredUntil,
      resolvedInRelease: data.resolvedInRelease,
    });
    if (!result) throw new Error("Issue not found");
    return { ok: true, issue: result };
  });

export const getSentryIssueFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetSentryIssueSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const issue = await getSentryIssue(db, data.projectId, data.issueId);
    if (!issue) throw new Error("Issue not found");

    return { issue };
  });
