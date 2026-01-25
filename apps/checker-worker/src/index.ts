import type { CheckJob, AlertJob } from "@bitwobbly/shared";
import { randomId } from "@bitwobbly/shared";

import {
  rebuildAllSnapshots,
  openIncident,
  resolveIncident,
} from "./repositories/snapshot";
import { getDb } from "./lib/db";
import {
  getMonitorState,
  upsertMonitorState,
} from "./repositories/monitor-state";
import type { Env } from "./types/env";

type TransitionRequest = {
  team_id: string;
  monitor_id: string;
  status: "up" | "down";
  reason?: string;
};

type DOState = {
  open_incident_id?: string;
};

export class IncidentCoordinator implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    console.log("[CHECKER] IncidentCoordinator initialized");
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/transition")
      return new Response("Not found", { status: 404 });

    const input = (await req.json()) as TransitionRequest;
    const current = (await this.state.storage.get<DOState>("s")) || {};

    if (input.status === "down") {
      if (current.open_incident_id)
        return json({
          ok: true,
          incident_id: current.open_incident_id,
          action: "noop_already_open",
        });

      const incidentId = await openIncident(
        { DB: this.env.DB },
        input.team_id,
        input.monitor_id,
        input.reason,
      );
      await this.state.storage.put<DOState>("s", {
        open_incident_id: incidentId,
      });

      await rebuildAllSnapshots({
        DB: this.env.DB,
        KV: this.env.KV,
      });

      return json({ ok: true, incident_id: incidentId, action: "opened" });
    }

    if (!current.open_incident_id)
      return json({ ok: true, action: "noop_no_open_incident" });

    const incidentId = current.open_incident_id;
    await resolveIncident({ DB: this.env.DB }, input.monitor_id, incidentId);
    await this.state.storage.put<DOState>("s", {});

    await rebuildAllSnapshots({
      DB: this.env.DB,
      KV: this.env.KV,
    });

    return json({ ok: true, incident_id: incidentId, action: "resolved" });
  }
}

export default {
  async queue(
    batch: MessageBatch<CheckJob>,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log(
      `[CHECKER] Received batch with ${batch.messages.length} messages`,
    );
    const db = getDb(env.DB);

    for (const msg of batch.messages) {
      try {
        if (
          msg.body.monitor_type === "webhook" ||
          msg.body.monitor_type === "manual"
        ) {
          console.log(
            `[CHECKER] Skipping ${msg.body.monitor_type} monitor ${msg.body.monitor_id}`,
          );
          msg.ack();
          continue;
        }

        console.log(
          `[CHECKER] Processing check for monitor ${msg.body.monitor_id} -> ${msg.body.url}`,
        );
        await handleCheck(msg.body, env, ctx, db);
        msg.ack();
        console.log(
          `[CHECKER] Successfully processed check for monitor ${msg.body.monitor_id}`,
        );
      } catch (e: unknown) {
        const error = e as Error;
        console.error("[CHECKER] check failed", error?.message || e);
      }
    }
  },
};

async function handleCheck(
  job: CheckJob,
  env: Env,
  ctx: ExecutionContext,
  db: ReturnType<typeof getDb>,
) {
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

    console.log(`[CHECKER] Checking ${job.url} with ${timeout}ms timeout`);

    try {
      const res = await fetch(job.url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
      });
      latency_ms = Date.now() - started;
      status = res.ok ? "up" : "down";
      if (!res.ok) reason = `HTTP ${res.status}`;
      console.log(
        `[CHECKER] Check result: ${status} (${latency_ms}ms) ${reason || ""}`,
      );
    } catch (e: unknown) {
      const error = e as Error;
      latency_ms = Date.now() - started;
      status = "down";
      reason =
        error?.name === "AbortError"
          ? "Timeout"
          : error?.message || "Fetch error";
      console.log(
        `[CHECKER] Check failed: ${status} (${latency_ms}ms) - ${reason}`,
      );
    } finally {
      clearTimeout(t);
    }
  }

  ctx.waitUntil(writeCheckEvent(env, job, status, latency_ms));

  const nowSec = Math.floor(Date.now() / 1000);
  const prev = await getMonitorState(db, job.monitor_id);

  const prevFailures = prev?.consecutiveFailures ?? 0;
  const prevIncidentOpen = prev?.incidentOpen ?? 0;
  const nextFailures = status === "down" ? prevFailures + 1 : 0;

  await upsertMonitorState(db, job.monitor_id, {
    lastCheckedAt: nowSec,
    lastStatus: status,
    lastLatencyMs: latency_ms,
    consecutiveFailures: nextFailures,
    lastError: reason || null,
  });

  const threshold = Math.max(1, Math.min(10, job.failure_threshold || 3));

  if (status === "down" && nextFailures >= threshold && !prevIncidentOpen) {
    console.log(
      `[CHECKER] Opening incident: ${nextFailures} failures >= threshold ${threshold}`,
    );
    const incidentId = await transitionViaDO(env, job, "down", reason);
    await enqueueAlert(env, {
      alert_id: randomId("al"),
      team_id: job.team_id,
      monitor_id: job.monitor_id,
      status: "down",
      reason,
      incident_id: incidentId || undefined,
    });
    console.log(`[CHECKER] Alert enqueued for incident ${incidentId}`);
    return;
  }

  if (status === "up" && prevIncidentOpen) {
    console.log(`[CHECKER] Resolving incident: monitor recovered`);
    const incidentId = await transitionViaDO(env, job, "up");
    await enqueueAlert(env, {
      alert_id: randomId("al"),
      team_id: job.team_id,
      monitor_id: job.monitor_id,
      status: "up",
      reason: "Recovered",
      incident_id: incidentId || undefined,
    });
    console.log(`[CHECKER] Recovery alert enqueued for incident ${incidentId}`);
    return;
  }
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
    const data = (await res.json()) as { incident_id?: string };
    return data.incident_id || null;
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

    console.log(
      `[CHECKER] Checking external service: ${serviceType || "custom"} at ${statusUrl}`,
    );

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

      const data = (await res.json()) as {
        status?: { indicator?: string };
      };
      const indicator = data?.status?.indicator;

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
    const error = e as Error;
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

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
