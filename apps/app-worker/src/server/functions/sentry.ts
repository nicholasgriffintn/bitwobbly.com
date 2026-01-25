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
} from "../repositories/sentry-projects";
import {
  listSentryEvents,
  getSentryEvent,
  listSentryIssues,
} from "../repositories/sentry-events";

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  platform: z.string().optional(),
});

export const listSentryProjectsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const projects = await listSentryProjects(db, teamId);
    return { projects };
  },
);

export const createSentryProjectFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateProjectSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const result = await createSentryProject(db, teamId, data);
    return { ok: true, ...result };
  });

export const getSentryProjectDsnFn = createServerFn({ method: "GET" })
  .inputValidator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const ingestHost = "ingest.bitwobbly.com";
    const result = await getSentryProjectDsn(
      db,
      teamId,
      data.projectId,
      ingestHost,
    );
    if (!result) throw new Error("Project not found");
    return result;
  });

export const listSentryEventsFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { projectId: string; since?: number; type?: string }) => data,
  )
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);

    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");

    const events = await listSentryEvents(db, data.projectId, {
      since: data.since,
      type: data.type,
    });
    return { events };
  });

export const getSentryEventPayloadFn = createServerFn({ method: "GET" })
  .inputValidator((data: { projectId: string; eventId: string }) => data)
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
  .inputValidator((data: { projectId: string; status?: string }) => data)
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
