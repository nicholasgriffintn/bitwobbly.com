import type { AlertJob, CheckJob } from "@bitwobbly/shared";
import { randomId } from "@bitwobbly/shared";
import { connect } from "cloudflare:sockets";
import type { DB } from "@bitwobbly/shared";
import { createLogger } from "@bitwobbly/shared";

import {
  getMonitorState,
  upsertMonitorState,
} from "../repositories/monitor-state";
import { getMonitorSuppressionState } from "../repositories/suppressions";
import type { Env } from "../types/env";
import { isRecord } from "./guards";
import { computeHeartbeatStatus, parseTargetHostPort } from "./monitor-utils";
import { readResponseTextUpTo } from "./http-utils";
import { checkTlsExpiry } from "./checks/tls";
import { isHttpUrl } from "./url-utils";

const logger = createLogger({ service: "checker-worker" });

export async function handleCheck(
  job: CheckJob,
  env: Env,
  ctx: ExecutionContext,
  db: DB
) {
  if (
    job.monitor_type === "webhook" ||
    job.monitor_type === "manual" ||
    (job.monitor_type === "heartbeat" && job.reported_status)
  ) {
    await handleReportedStatus(job, env, ctx, db);
    return;
  }

  const started = Date.now();
  const timeout = Math.max(1000, Math.min(30000, job.timeout_ms || 8000));

  let status: "up" | "down" = "down";
  let reason: string | undefined;
  let latency_ms: number | null = null;

  let config: unknown = null;
  if (job.external_config) {
    try {
      config = JSON.parse(job.external_config);
    } catch {
      status = "down";
      reason = "Invalid config JSON";
      latency_ms = Date.now() - started;
      await handleStatusResult(job, env, ctx, db, {
        status,
        reason,
        latency_ms,
      });
      return;
    }
  }

  if (job.monitor_type === "external") {
    const result = await checkExternalService(job, timeout);
    status = result.status;
    reason = result.reason;
    latency_ms = result.latency_ms;
  } else if (job.monitor_type === "heartbeat") {
    const nowSec = Math.floor(Date.now() / 1000);
    const prev = await getMonitorState(db, job.monitor_id);
    const lastSeenSec = prev?.lastCheckedAt ?? 0;
    const intervalSec = job.interval_seconds || 60;

    let graceSec = Math.max(30, Math.floor(intervalSec / 2));
    if (isRecord(config) && typeof config.graceSeconds === "number") {
      graceSec = Math.max(0, Math.floor(config.graceSeconds));
    }

    const result = computeHeartbeatStatus({
      nowSec,
      lastSeenSec,
      intervalSec,
      graceSec,
    });

    status = result.status;
    reason = result.reason;
    latency_ms = null;

    await handleStatusResult(
      job,
      env,
      ctx,
      db,
      { status, reason, latency_ms },
      { checkedAtSec: lastSeenSec }
    );
    return;
  } else if (
    job.monitor_type === "tcp" ||
    job.monitor_type === "ping" ||
    job.monitor_type === "tls"
  ) {
    const defaultPort =
      job.monitor_type === "tls" ? 443 : job.monitor_type === "ping" ? 443 : 80;

    const target = parseTargetHostPort(job.url, defaultPort);
    if (!target) {
      status = "down";
      reason = "Invalid target";
      latency_ms = Date.now() - started;
    } else {
      if (job.monitor_type === "tls") {
        const minDaysRemaining =
          isRecord(config) && typeof config.minDaysRemaining === "number"
            ? Math.max(0, Math.floor(config.minDaysRemaining))
            : 14;
        const allowInvalid =
          isRecord(config) && typeof config.allowInvalid === "boolean"
            ? config.allowInvalid
            : false;

        const tlsResult = await checkTlsExpiry({
          hostname: target.hostname,
          port: target.port,
          timeoutMs: timeout,
          minDaysRemaining,
          allowInvalid,
        });
        status = tlsResult.status;
        reason = tlsResult.reason;
        latency_ms = tlsResult.latency_ms;
      } else {
        const allowHalfOpen = false;
        const secureTransport = job.monitor_type === "ping" ? "on" : "off";
        const socket = connect(
          { hostname: target.hostname, port: target.port },
          { secureTransport, allowHalfOpen }
        );

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timed = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Timeout")), timeout);
        });

        try {
          await Promise.race([socket.opened, timed]);
          latency_ms = Date.now() - started;
          status = "up";
        } catch (e: unknown) {
          latency_ms = Date.now() - started;
          status = "down";
          reason = e instanceof Error ? e.message : "Socket error";
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          try {
            await socket.close();
          } catch {
            // ignore
          }
        }
      }
    }
  } else if (job.monitor_type === "dns") {
    const name = job.url.includes("://")
      ? (() => {
          try {
            return new URL(job.url).hostname;
          } catch {
            return job.url.trim();
          }
        })()
      : job.url.trim();

    if (!name) {
      status = "down";
      reason = "Invalid DNS name";
      latency_ms = Date.now() - started;
    } else {
      const recordType =
        isRecord(config) && typeof config.recordType === "string"
          ? config.recordType.toUpperCase()
          : "A";

      const expected =
        isRecord(config) && typeof config.expectedIncludes === "string"
          ? config.expectedIncludes
          : undefined;

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort("timeout"), timeout);

      try {
        const res = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
            name
          )}&type=${encodeURIComponent(recordType)}`,
          {
            method: "GET",
            signal: controller.signal,
            headers: { accept: "application/dns-json" },
          }
        );

        latency_ms = Date.now() - started;
        if (!res.ok) {
          status = "down";
          reason = `DNS HTTP ${res.status}`;
        } else {
          const data: unknown = await res.json();
          const answers =
            isRecord(data) && Array.isArray(data.Answer) ? data.Answer : [];
          const values = answers
            .map((a) => (isRecord(a) ? a.data : null))
            .filter((v): v is string => typeof v === "string");

          if (!values.length) {
            status = "down";
            reason = "No DNS answers";
          } else if (expected && !values.some((v) => v.includes(expected))) {
            status = "down";
            reason = `DNS answer did not include expected value`;
          } else {
            status = "up";
          }
        }
      } catch (e: unknown) {
        const error = e instanceof Error ? e : null;
        latency_ms = Date.now() - started;
        status = "down";
        reason =
          error?.name === "AbortError"
            ? "Timeout"
            : error?.message || "DNS fetch error";
      } finally {
        clearTimeout(t);
      }
    }
  } else {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort("timeout"), timeout);

    try {
      const headers: HeadersInit = {};
      if (job.monitor_type === "browser") {
        headers["user-agent"] =
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
        headers["accept"] =
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
      }

      const res = await fetch(job.url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
        headers,
      });

      latency_ms = Date.now() - started;
      status = res.ok ? "up" : "down";
      if (!res.ok) reason = `HTTP ${res.status}`;

      if (status === "up" && job.monitor_type === "http_assert") {
        const expectedStatus =
          isRecord(config) && Array.isArray(config.expectedStatus)
            ? config.expectedStatus.filter(
                (n: unknown) => typeof n === "number"
              )
            : null;

        if (expectedStatus?.length && !expectedStatus.includes(res.status)) {
          status = "down";
          reason = `Unexpected HTTP ${res.status}`;
        }

        const bodyIncludes =
          isRecord(config) && typeof config.bodyIncludes === "string"
            ? config.bodyIncludes
            : null;

        if (status === "up" && bodyIncludes) {
          const body = await readResponseTextUpTo(res, 64 * 1024);
          if (!body.includes(bodyIncludes)) {
            status = "down";
            reason = "Body assertion failed";
          }
        }
      }

      if (
        status === "up" &&
        (job.monitor_type === "http_keyword" || job.monitor_type === "browser")
      ) {
        const keyword =
          isRecord(config) && typeof config.keyword === "string"
            ? config.keyword
            : null;

        if (keyword) {
          const body = await readResponseTextUpTo(res, 64 * 1024);
          const caseSensitive =
            isRecord(config) && typeof config.caseSensitive === "boolean"
              ? config.caseSensitive
              : false;
          const haystack = caseSensitive ? body : body.toLowerCase();
          const needle = caseSensitive ? keyword : keyword.toLowerCase();
          if (!haystack.includes(needle)) {
            status = "down";
            reason = "Keyword not found";
          }
        }
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e : null;
      latency_ms = Date.now() - started;
      status = "down";
      reason =
        error?.name === "AbortError"
          ? "Timeout"
          : error?.message || "Fetch error";
      logger.error(`Check failed: ${status} (${latency_ms}ms) - ${reason}`);
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
  options?: { checkedAtSec?: number }
) {
  ctx.waitUntil(writeCheckEvent(env, job, result.status, result.latency_ms));

  const nowSec = Math.floor(Date.now() / 1000);
  const checkedAtSec = options?.checkedAtSec ?? nowSec;
  const suppression = await getMonitorSuppressionState(
    db,
    job.team_id,
    job.monitor_id,
    nowSec
  );
  const prev = await getMonitorState(db, job.monitor_id);

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

async function handleReportedStatus(
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

async function checkExternalService(
  job: CheckJob,
  timeout: number
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
    const statusUrl =
      typeof config?.statusUrl === "string" ? config.statusUrl : job.url;

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

    if (!statusUrl || !isHttpUrl(statusUrl)) {
      return {
        status: "down",
        reason: "Invalid external status URL",
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
