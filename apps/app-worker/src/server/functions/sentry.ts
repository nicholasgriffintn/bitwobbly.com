import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "../lib/db";
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
  limit: z.number().int().min(1).max(500).optional(),
});

const GetSentryEventPayloadSchema = z.object({
  projectId: z.string().min(1),
  eventId: z.string().min(1),
});

const ListSentryIssuesSchema = z.object({
  projectId: z.string().min(1),
  status: SentryIssueStatusSchema.optional(),
});

const UpdateSentryIssueSchema = z.object({
  projectId: z.string().min(1),
  issueId: z.string().min(1),
  status: SentryIssueStatusSchema,
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

export const listSentryIssuesFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ListSentryIssuesSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const issues = await listSentryIssues(db, data.projectId, {
      status: data.status,
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
