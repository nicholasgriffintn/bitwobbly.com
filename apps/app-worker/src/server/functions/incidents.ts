import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

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
} from "../services/status-snapshots";
import { requireTeam } from "../lib/auth-middleware";

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
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const incidents = await listAllIncidents(db, teamId);
    return { incidents };
  },
);

export const listOpenIncidentsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const incidents = await listOpenIncidents(db, teamId, null);
    return { incidents };
  },
);

export const createIncidentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateIncidentSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const created = await createIncident(db, teamId, data);

    if (data.affectedComponents && data.affectedComponents.length > 0) {
      await clearAllStatusPageCaches(db, vars.KV, teamId);
    } else if (data.statusPageId) {
      await clearStatusPageCache(db, vars.KV, teamId, data.statusPageId);
    }

    return { ok: true, ...created };
  });

export const updateIncidentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpdateIncidentSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const result = await addIncidentUpdate(db, teamId, data.incidentId, {
      message: data.message,
      status: data.status,
    });

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true, ...result };
  });

export const deleteIncidentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteIncident(db, teamId, data.id);

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true };
  });
