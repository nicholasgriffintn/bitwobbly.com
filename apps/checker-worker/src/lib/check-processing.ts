import type { CheckJob } from "@bitwobbly/shared";
import { connect } from "cloudflare:sockets";
import type { DB } from "@bitwobbly/shared";
import { createLogger } from "@bitwobbly/shared";

import { getMonitorState } from "../repositories/monitor-state";
import type { Env } from "../types/env";
import { isRecord } from "./guards";
import { computeHeartbeatStatus, parseTargetHostPort } from "./monitor-utils";
import { readResponseTextUpTo } from "./http-utils";
import { checkTlsExpiry } from "./checks/tls";
import { checkExternalService } from "./checks/external-service";
import { handleReportedStatus, handleStatusResult } from "./status-result-handler";

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
