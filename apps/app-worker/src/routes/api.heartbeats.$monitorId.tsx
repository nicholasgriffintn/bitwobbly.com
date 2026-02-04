import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { env } from "cloudflare:workers";

import { getDb } from "@/server/lib/db";
import { getMonitorByWebhookToken } from "@/server/repositories/monitors";
import { hashWebhookToken, randomId } from "@bitwobbly/shared";

const HeartbeatPayloadSchema = z.object({
  token: z.string(),
  message: z.string().optional(),
});

export const Route = createFileRoute("/api/heartbeats/$monitorId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const vars = env;

          const { success } = await vars.WEBHOOK_RATE_LIMITER.limit({
            key: `heartbeat:${params.monitorId}`,
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
          const data = HeartbeatPayloadSchema.parse(body);
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

          if (monitor.type !== "heartbeat") {
            return Response.json(
              { ok: false, error: "Monitor is not a heartbeat type" },
              { status: 400 },
            );
          }

          await vars.CHECK_JOBS.send({
            job_id: randomId("job"),
            team_id: monitor.teamId,
            monitor_id: monitor.id,
            monitor_type: "heartbeat",
            url: monitor.url || "",
            interval_seconds: Number(monitor.intervalSeconds) || 60,
            timeout_ms: Number(monitor.timeoutMs) || 8000,
            failure_threshold: Number(monitor.failureThreshold) || 3,
            external_config: monitor.externalConfig || undefined,
            reported_status: "up",
            reported_reason: data.message,
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

