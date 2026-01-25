import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { redirect } from "@tanstack/react-router";

import { getDb } from "../lib/db";
import {
  listAllIncidents,
  listOpenIncidents,
  createIncident,
  addIncidentUpdate,
  deleteIncident,
} from "../repositories/incidents";
import {
  clearStatusPageCache,
  clearAllStatusPageCaches,
} from "../repositories/status-pages";
import { useAppSession } from "../lib/session";

const authMiddleware = createServerFn().handler(async () => {
  const session = await useAppSession();
  if (!session.data.userId) {
    throw redirect({ to: "/login" });
  }
  return session.data.userId;
});

const CreateIncidentSchema = z.object({
  title: z.string().min(1),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  statusPageId: z.string().optional(),
  monitorId: z.string().optional(),
  message: z.string().optional(),
  affectedComponents: z
    .array(
      z.object({
        componentId: z.string(),
        impactLevel: z.enum(["down", "degraded", "maintenance"]),
      }),
    )
    .optional(),
});

const UpdateIncidentSchema = z.object({
  incidentId: z.string(),
  message: z.string().min(1),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
});

export const listIncidentsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    const incidents = await listAllIncidents(db, vars.PUBLIC_TEAM_ID);
    return { incidents };
  },
);

export const listOpenIncidentsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    const incidents = await listOpenIncidents(db, vars.PUBLIC_TEAM_ID, null);
    return { incidents };
  },
);

export const createIncidentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateIncidentSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    const created = await createIncident(db, vars.PUBLIC_TEAM_ID, data);

    if (data.affectedComponents && data.affectedComponents.length > 0) {
      await clearAllStatusPageCaches(db, vars.KV, vars.PUBLIC_TEAM_ID);
    } else if (data.statusPageId) {
      await clearStatusPageCache(
        db,
        vars.KV,
        vars.PUBLIC_TEAM_ID,
        data.statusPageId,
      );
    }

    return { ok: true, ...created };
  });

export const updateIncidentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateIncidentSchema.parse(data))
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    const result = await addIncidentUpdate(
      db,
      vars.PUBLIC_TEAM_ID,
      data.incidentId,
      {
        message: data.message,
        status: data.status,
      },
    );

    await clearAllStatusPageCaches(db, vars.KV, vars.PUBLIC_TEAM_ID);

    return { ok: true, ...result };
  });

export const deleteIncidentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await authMiddleware();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteIncident(db, vars.PUBLIC_TEAM_ID, data.id);

    await clearAllStatusPageCaches(db, vars.KV, vars.PUBLIC_TEAM_ID);

    return { ok: true };
  });
