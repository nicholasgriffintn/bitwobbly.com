import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { randomId } from "@bitwobbly/shared";

import { getDb } from "../lib/db";
import {
  listAllIncidents,
  listOpenIncidents,
  createIncident,
  addIncidentUpdate,
  getIncidentStatusPageId,
  listIncidentComponentIds,
  deleteIncident,
} from "../repositories/incidents";
import {
  createSubscriberEvent,
  insertSubscriptionAuditLog,
  listDeliverableSubscribersForStatusPage,
  listStatusPageIdsForComponents,
} from "../repositories/status-page-subscribers";
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
      })
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
  }
);

export const listOpenIncidentsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const incidents = await listOpenIncidents(db, teamId, null);
    return { incidents };
  }
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

    const targetStatusPageIds = new Set<string>();
    if (data.statusPageId) {
      targetStatusPageIds.add(data.statusPageId);
    }
    if (data.affectedComponents?.length) {
      const componentIds = data.affectedComponents.map((c) => c.componentId);
      const pageIds = await listStatusPageIdsForComponents(
        db,
        teamId,
        componentIds
      );
      for (const pageId of pageIds) targetStatusPageIds.add(pageId);
    }

    for (const statusPageId of targetStatusPageIds) {
      const subscribers = await listDeliverableSubscribersForStatusPage(
        db,
        statusPageId
      );

      for (const sub of subscribers) {
        const { eventId } = await createSubscriberEvent(db, {
          statusPageId,
          subscriberId: sub.id,
          eventType: "incident_created",
          incidentId: created.id,
          incidentUpdateId: null,
        });

        if (sub.digestCadence === "immediate") {
          await vars.ALERT_JOBS.send({
            type: "status_page_deliver_events",
            job_id: randomId("spj"),
            subscriber_id: sub.id,
            event_ids: [eventId],
          });
        }
      }

      await insertSubscriptionAuditLog(db, {
        statusPageId,
        action: "incident_event_fanned_out",
        meta: {
          incident_id: created.id,
          subscriber_count: subscribers.length,
        },
      });
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

    const targetStatusPageIds = new Set<string>();
    const linkedStatusPageId = await getIncidentStatusPageId(
      db,
      teamId,
      data.incidentId
    );
    if (linkedStatusPageId) targetStatusPageIds.add(linkedStatusPageId);

    const componentIds = await listIncidentComponentIds(db, data.incidentId);
    if (componentIds.length) {
      const pageIds = await listStatusPageIdsForComponents(
        db,
        teamId,
        componentIds
      );
      for (const pageId of pageIds) targetStatusPageIds.add(pageId);
    }

    const eventType =
      data.status === "resolved" ? "incident_resolved" : "incident_updated";

    for (const statusPageId of targetStatusPageIds) {
      const subscribers = await listDeliverableSubscribersForStatusPage(
        db,
        statusPageId
      );

      for (const sub of subscribers) {
        const { eventId } = await createSubscriberEvent(db, {
          statusPageId,
          subscriberId: sub.id,
          eventType,
          incidentId: data.incidentId,
          incidentUpdateId: result.id,
        });

        if (sub.digestCadence === "immediate") {
          await vars.ALERT_JOBS.send({
            type: "status_page_deliver_events",
            job_id: randomId("spj"),
            subscriber_id: sub.id,
            event_ids: [eventId],
          });
        }
      }

      await insertSubscriptionAuditLog(db, {
        statusPageId,
        action: "incident_event_fanned_out",
        meta: {
          incident_id: data.incidentId,
          incident_update_id: result.id,
          subscriber_count: subscribers.length,
          event_type: eventType,
        },
      });
    }

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
