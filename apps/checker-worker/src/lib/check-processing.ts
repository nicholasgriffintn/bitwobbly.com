import type { AlertJob, CheckJob } from "@bitwobbly/shared";
import { randomId } from "@bitwobbly/shared";

import { getMonitorState, upsertMonitorState } from "../repositories/monitor-state";
import type { Env } from "../types/env";
import { isRecord } from "./guards";
import type { DB } from "./db";

export async function handleCheck(
  job: CheckJob,
  env: Env,
  ctx: ExecutionContext,
  db: DB,
) {
  if (job.monitor_type === "webhook" || job.monitor_type === "manual") {
    await handleReportedStatus(job, env, ctx, db);
    return;
  }

  const started = Date.now();
  const timeout = Math.max(1000, Math.min(30000, job.timeout_ms || 8000));

  let status: "up" | "down" = "down";
  let reason: string | undefined;
  let latency_ms: number | null = null;

  if (job.monitor_type === "external") {
    const result = await checkExternalService(job, timeout);
    status = result.status;
    reason = result.reason;
    latency_ms = result.latency_ms;
  } else {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort("timeout"), timeout);

    try {
      const res = await fetch(job.url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
      });
      latency_ms = Date.now() - started;
      status = res.ok ? "up" : "down";
      if (!res.ok) reason = `HTTP ${res.status}`;
    } catch (e: unknown) {
      const error = e instanceof Error ? e : null;
      latency_ms = Date.now() - started;
      status = "down";
      reason =
        error?.name === "AbortError"
          ? "Timeout"
          : error?.message || "Fetch error";
      console.error(
        `[CHECKER] Check failed: ${status} (${latency_ms}ms) - ${reason}`,
      );
    } finally {
      clearTimeout(t);
    }
  }

  await handleStatusResult(job, env, ctx, db, {
    status,
    reason,
    latency_ms,
  });
}

async function handleStatusResult(
  job: CheckJob,
  env: Env,
  ctx: ExecutionContext,
  db: DB,
  result: { status: "up" | "down"; reason?: string; latency_ms: number | null },
) {
  ctx.waitUntil(writeCheckEvent(env, job, result.status, result.latency_ms));

  const nowSec = Math.floor(Date.now() / 1000);
  const prev = await getMonitorState(db, job.monitor_id);

  const prevFailures = prev?.consecutiveFailures ?? 0;
  const prevIncidentOpen = prev?.incidentOpen ?? 0;
  const nextFailures = result.status === "down" ? prevFailures + 1 : 0;

  await upsertMonitorState(db, job.monitor_id, {
    lastCheckedAt: nowSec,
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
    if (job.job_id) {
      const alreadySent = await env.KV.get(`dedupe:alert:${job.job_id}:down`);
      if (alreadySent) return;
    }

    const incidentId = await transitionViaDO(env, job, "down", result.reason);
    await enqueueAlert(env, {
      type: "monitor",
      alert_id: randomId("al"),
      team_id: job.team_id,
      monitor_id: job.monitor_id,
      status: "down",
      reason: result.reason,
      incident_id: incidentId || undefined,
    });

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
    await enqueueAlert(env, {
      type: "monitor",
      alert_id: randomId("al"),
      team_id: job.team_id,
      monitor_id: job.monitor_id,
      status: "up",
      reason: "Recovered",
      incident_id: incidentId || undefined,
    });

    if (job.job_id) {
      await env.KV.put(`dedupe:alert:${job.job_id}:up`, "1", {
        expirationTtl: 60 * 60 * 24 * 2,
      });
    }
  }
}

function mapReportedStatus(
  status?: "up" | "down" | "degraded",
): "up" | "down" | null {
  if (!status) return null;
  if (status === "up") return "up";
  if (status === "down" || status === "degraded") return "down";
  return null;
}

async function handleReportedStatus(
  job: CheckJob,
  env: Env,
  ctx: ExecutionContext,
  db: DB,
) {
  const mapped = mapReportedStatus(job.reported_status);
  if (!mapped) {
    console.warn(
      "[CHECKER] webhook/manual job missing reported_status",
      job.monitor_id,
    );
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
  latency_ms: number | null,
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
  reason?: string,
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

async function checkExternalService(
  job: CheckJob,
  timeout: number,
): Promise<{ status: "up" | "down"; reason?: string; latency_ms: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort("timeout"), timeout);

  try {
    let config;
    try {
      config = job.external_config ? JSON.parse(job.external_config) : null;
    } catch {
      return {
        status: "down",
        reason: "Invalid external config",
        latency_ms: Date.now() - started,
      };
    }

    const serviceType = config?.serviceType;
    const statusUrl = config?.statusUrl || job.url;

    if (serviceType && serviceType.startsWith("cloudflare-")) {
      const cfStatusUrl = "https://www.cloudflarestatus.com/api/v2/status.json";
      const res = await fetch(cfStatusUrl, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });

      if (!res.ok) {
        return {
          status: "down",
          reason: `Cloudflare status API returned ${res.status}`,
          latency_ms: Date.now() - started,
        };
      }

      const data: unknown = await res.json();
      let indicator: string | undefined;
      if (isRecord(data) && isRecord(data.status)) {
        indicator =
          typeof data.status.indicator === "string"
            ? data.status.indicator
            : undefined;
      }

      if (indicator === "none" || indicator === "minor") {
        return {
          status: "up",
          latency_ms: Date.now() - started,
        };
      }

      return {
        status: "down",
        reason: `Cloudflare status: ${indicator || "unknown"}`,
        latency_ms: Date.now() - started,
      };
    }

    const res = await fetch(statusUrl, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    const latency_ms = Date.now() - started;
    const status = res.ok ? "up" : "down";
    const reason = !res.ok ? `HTTP ${res.status}` : undefined;

    return { status, reason, latency_ms };
  } catch (e: unknown) {
    const error = e instanceof Error ? e : null;
    return {
      status: "down",
      reason:
        error?.name === "AbortError"
          ? "Timeout"
          : error?.message || "Fetch error",
      latency_ms: Date.now() - started,
    };
  } finally {
    clearTimeout(t);
  }
}
