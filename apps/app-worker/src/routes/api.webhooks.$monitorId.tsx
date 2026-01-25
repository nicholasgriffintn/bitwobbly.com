import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { env } from "cloudflare:workers";

import { getDb } from "@/server/lib/db";
import {
  getMonitorByWebhookToken,
  updateMonitorStatus,
} from "@/server/repositories/monitors";
import { hashWebhookToken } from "@bitwobbly/shared";

const WebhookPayloadSchema = z.object({
  status: z.enum(["up", "down", "degraded"]),
  message: z.string().optional(),
  token: z.string(),
});

export const Route = createFileRoute("/api/webhooks/$monitorId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const body = await request.json();
          const data = WebhookPayloadSchema.parse(body);
          const vars = env;
          const db = getDb(vars.DB);

          const tokenHash = await hashWebhookToken(data.token);
          const monitor = await getMonitorByWebhookToken(
            db,
            params.monitorId,
            tokenHash,
          );

          if (!monitor) {
            return Response.json(
              { ok: false, error: "Invalid monitor ID or token" },
              { status: 401 },
            );
          }

          if (monitor.type !== "webhook") {
            return Response.json(
              { ok: false, error: "Monitor is not a webhook type" },
              { status: 400 },
            );
          }

          await updateMonitorStatus(
            db,
            monitor.teamId,
            params.monitorId,
            data.status,
            data.message,
          );

          return Response.json({ ok: true });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json(
              { ok: false, error: "Invalid request body" },
              { status: 400 },
            );
          }

          return Response.json(
            { ok: false, error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
