import type { AlertJob, CheckJob } from "@bitwobbly/shared";
import { randomId } from "@bitwobbly/shared";
import type { DB } from "@bitwobbly/shared";
import { createLogger } from "@bitwobbly/shared";

import {
  getMonitorState,
  upsertMonitorState,
} from "../repositories/monitor-state";
import { getMonitorSuppressionState } from "../repositories/suppressions";
import type { Env } from "../types/env";
import { enqueueAiActionTriggerWithCooldown } from "./ai-action-trigger";
import { isRecord } from "./guards";

const logger = createLogger({ service: "checker-worker" });

export async function handleStatusResult(
  job: CheckJob,
  env: Env,
  ctx: ExecutionContext,
  db: DB,
  result: { status: "up" | "down"; reason?: string; latency_ms: number | null },
  options?: { checkedAtSec?: number }
) {
  ctx.waitUntil(writeCheckEvent(env, job, result.status, result.latency_ms));

  const nowSec = Math.floor(Date.now() / 1000);
  const checkedAtSec = options?.checkedAtSec ?? nowSec;
  const [suppression, prev] = await Promise.all([
    getMonitorSuppressionState(db, job.team_id, job.monitor_id, nowSec),
    getMonitorState(db, job.monitor_id),
  ]);

  const prevFailures = prev?.consecutiveFailures ?? 0;
  const prevIncidentOpen = prev?.incidentOpen ?? 0;
  const nextFailures =
    result.status === "down" && suppression.isMaintenance
      ? 0
      : result.status === "down"
        ? prevFailures + 1
        : 0;

  await upsertMonitorState(db, job.monitor_id, {
    lastCheckedAt: checkedAtSec,
    lastStatus: result.status,
    lastLatencyMs: result.latency_ms,
    consecutiveFailures: nextFailures,
    lastError: result.status === "down" ? result.reason || null : null,
  });

  const threshold = Math.max(1, Math.min(10, job.failure_threshold || 3));

  if (
    result.status === "down" &&
    nextFailures >= threshold &&
    !prevIncidentOpen
  ) {
    if (suppression.isMaintenance) return;

    if (job.job_id) {
      const alreadySent = await env.KV.get(`dedupe:alert:${job.job_id}:down`);
      if (alreadySent) return;
    }

    const incidentId = await transitionViaDO(env, job, "down", result.reason);
    if (!suppression.isSilenced) {
      await enqueueAlert(env, {
        type: "monitor",
        alert_id: randomId("al"),
        team_id: job.team_id,
        monitor_id: job.monitor_id,
        status: "down",
        reason: result.reason,
        incident_id: incidentId || undefined,
      });
    }
    await enqueueAiActionTriggerWithCooldown(
      {
        queue: env.ACTION_TRIGGER_JOBS,
        dedupeStore: env.KV,
      },
      {
        source: "monitor_transition",
        type: "monitor_down",
        teamId: job.team_id,
        idempotencyKey: `monitor_down:${job.monitor_id}:${incidentId || "none"}`,
        metadata: {
          monitorId: job.monitor_id,
          incidentId: incidentId ?? null,
          reason: result.reason ?? null,
        },
      }
    );

    if (job.job_id) {
      await env.KV.put(`dedupe:alert:${job.job_id}:down`, "1", {
        expirationTtl: 60 * 60 * 24 * 2,
      });
    }
    return;
  }

  if (result.status === "up" && prevIncidentOpen) {
    if (job.job_id) {
      const alreadySent = await env.KV.get(`dedupe:alert:${job.job_id}:up`);
      if (alreadySent) return;
    }

    const incidentId = await transitionViaDO(env, job, "up");
    if (!suppression.isSilenced) {
      await enqueueAlert(env, {
        type: "monitor",
        alert_id: randomId("al"),
        team_id: job.team_id,
        monitor_id: job.monitor_id,
        status: "up",
        reason: "Recovered",
        incident_id: incidentId || undefined,
      });
    }
    await enqueueAiActionTriggerWithCooldown(
      {
        queue: env.ACTION_TRIGGER_JOBS,
        dedupeStore: env.KV,
      },
      {
        source: "monitor_transition",
        type: "monitor_recovered",
        teamId: job.team_id,
        idempotencyKey: `monitor_recovered:${job.monitor_id}:${incidentId || "none"}`,
        metadata: {
          monitorId: job.monitor_id,
          incidentId: incidentId ?? null,
        },
      }
    );

    if (job.job_id) {
      await env.KV.put(`dedupe:alert:${job.job_id}:up`, "1", {
        expirationTtl: 60 * 60 * 24 * 2,
      });
    }
  }
}

function mapReportedStatus(
  status?: "up" | "down" | "degraded"
): "up" | "down" | null {
  if (!status) return null;
  if (status === "up") return "up";
  if (status === "down" || status === "degraded") return "down";
  return null;
}

export async function handleReportedStatus(
  job: CheckJob,
  env: Env,
  ctx: ExecutionContext,
  db: DB
) {
  const mapped = mapReportedStatus(job.reported_status);
  if (!mapped) {
    logger.warn("webhook/manual job missing reported_status", {
      job_id: job.job_id,
    });
    return;
  }

  const status: "up" | "down" = mapped;
  const reason =
    job.reported_reason ||
    (job.reported_status === "degraded"
      ? "Service is degraded."
      : status === "down"
        ? "Reported down."
        : "Reported up.");

  await handleStatusResult(job, env, ctx, db, {
    status,
    reason,
    latency_ms: null,
  });
}

async function writeCheckEvent(
  env: Env,
  job: CheckJob,
  status: "up" | "down",
  latency_ms: number | null
) {
  if (!env.AE) return;
  env.AE.writeDataPoint({
    blobs: [job.team_id, job.monitor_id, status],
    doubles: [latency_ms ?? 0],
    indexes: [job.team_id],
  });
}

async function enqueueAlert(env: Env, alert: AlertJob) {
  await env.ALERT_JOBS.send(alert);
}

async function transitionViaDO(
  env: Env,
  job: CheckJob,
  status: "up" | "down",
  reason?: string
): Promise<string | null> {
  try {
    const id = env.INCIDENT_DO.idFromName(`${job.team_id}:${job.monitor_id}`);
    const stub = env.INCIDENT_DO.get(id);
    const res = await stub.fetch("https://do/transition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        team_id: job.team_id,
        monitor_id: job.monitor_id,
        status,
        reason,
      }),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!isRecord(data)) return null;
    return typeof data.incident_id === "string" ? data.incident_id : null;
  } catch {
    return null;
  }
}

