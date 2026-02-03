import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { env } from "cloudflare:workers";

import { getDb } from "@/server/lib/db";
import {
  getMonitorByWebhookToken,
} from "@/server/repositories/monitors";
import { hashWebhookToken } from "@bitwobbly/shared";
import { processMonitorStatusUpdate } from "@/server/lib/monitor-transitions";

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
          const vars = env;

          const { success } = await vars.WEBHOOK_RATE_LIMITER.limit({
            key: `webhook:${params.monitorId}`,
          });

          if (!success) {
            return Response.json(
              { ok: false, error: "Rate limit exceeded" },
              {
                status: 429,
                headers: { "Retry-After": "60" },
              },
            );
          }

          const body = await request.json();
          const data = WebhookPayloadSchema.parse(body);
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

          await processMonitorStatusUpdate({
            db,
            kv: vars.KV,
            alertJobs: vars.ALERT_JOBS,
            monitor: {
              id: monitor.id,
              teamId: monitor.teamId,
              failureThreshold: monitor.failureThreshold,
            },
            status: data.status,
            reason: data.message,
          });

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
