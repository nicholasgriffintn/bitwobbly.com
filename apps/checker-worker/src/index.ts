import type { Env } from './env';
import type { CheckJob, AlertJob } from '@bitwobbly/shared';
import { nowIso, randomId } from '@bitwobbly/shared';
import { rebuildAllSnapshots, openIncident, resolveIncident } from './snapshot';

type TransitionRequest = {
  team_id: string;
  monitor_id: string;
  status: 'up' | 'down';
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
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/transition')
      return new Response('Not found', { status: 404 });

    const input = (await req.json()) as TransitionRequest;
    const current = (await this.state.storage.get<DOState>('s')) || {};

    if (input.status === 'down') {
      if (current.open_incident_id)
        return json({
          ok: true,
          incident_id: current.open_incident_id,
          action: 'noop_already_open',
        });

      const incidentId = await openIncident(
        { DB: this.env.DB },
        input.team_id,
        input.monitor_id,
        input.reason
      );
      await this.state.storage.put<DOState>('s', {
        open_incident_id: incidentId,
      });

      await rebuildAllSnapshots({
        DB: this.env.DB,
        KV: this.env.KV,
        PUBLIC_TEAM_ID: this.env.PUBLIC_TEAM_ID,
      });

      return json({ ok: true, incident_id: incidentId, action: 'opened' });
    }

    // up
    if (!current.open_incident_id)
      return json({ ok: true, action: 'noop_no_open_incident' });

    const incidentId = current.open_incident_id;
    await resolveIncident({ DB: this.env.DB }, input.monitor_id, incidentId);
    await this.state.storage.put<DOState>('s', {});

    await rebuildAllSnapshots({
      DB: this.env.DB,
      KV: this.env.KV,
      PUBLIC_TEAM_ID: this.env.PUBLIC_TEAM_ID,
    });

    return json({ ok: true, incident_id: incidentId, action: 'resolved' });
  }
}

export default {
  async queue(
    batch: MessageBatch<CheckJob>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await handleCheck(msg.body, env, ctx);
        msg.ack();
      } catch (e: any) {
        console.error('check failed', e?.message || e);
        // retry: do not ack
      }
    }
  },
};

async function handleCheck(job: CheckJob, env: Env, ctx: ExecutionContext) {
  const started = Date.now();
  const timeout = Math.max(1000, Math.min(30000, job.timeout_ms || 8000));
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort('timeout'), timeout);

  let status: 'up' | 'down' = 'down';
  let reason: string | undefined;
  let latency_ms: number | null = null;

  try {
    const res = await fetch(job.url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });
    latency_ms = Date.now() - started;
    status = res.ok ? 'up' : 'down';
    if (!res.ok) reason = `HTTP ${res.status}`;
  } catch (e: any) {
    latency_ms = Date.now() - started;
    status = 'down';
    reason = e?.name === 'AbortError' ? 'Timeout' : e?.message || 'Fetch error';
  } finally {
    clearTimeout(t);
  }

  ctx.waitUntil(writeCheckEvent(env, job, status, latency_ms, reason));

  const nowSec = Math.floor(Date.now() / 1000);
  const prev = (await env.DB.prepare(
    'SELECT * FROM monitor_state WHERE monitor_id = ?'
  )
    .bind(job.monitor_id)
    .first()) as any;

  const prevFailures = prev?.consecutive_failures ?? 0;
  const prevIncidentOpen = prev?.incident_open ?? 0;
  const nextFailures = status === 'down' ? prevFailures + 1 : 0;

  await env.DB.prepare(
    `
    INSERT INTO monitor_state (monitor_id, last_checked_at, last_status, last_latency_ms, consecutive_failures, last_error, incident_open, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT incident_open FROM monitor_state WHERE monitor_id = ?), 0), ?)
    ON CONFLICT(monitor_id) DO UPDATE SET
      last_checked_at=excluded.last_checked_at,
      last_status=excluded.last_status,
      last_latency_ms=excluded.last_latency_ms,
      consecutive_failures=excluded.consecutive_failures,
      last_error=excluded.last_error,
      updated_at=excluded.updated_at
  `
  )
    .bind(
      job.monitor_id,
      nowSec,
      status,
      latency_ms,
      nextFailures,
      reason || null,
      job.monitor_id,
      nowIso()
    )
    .run();

  const threshold = Math.max(1, Math.min(10, job.failure_threshold || 3));

  if (status === 'down' && nextFailures >= threshold && !prevIncidentOpen) {
    const incidentId = await transitionViaDO(env, job, 'down', reason);
    await enqueueAlert(env, {
      alert_id: randomId('al'),
      team_id: job.team_id,
      monitor_id: job.monitor_id,
      status: 'down',
      reason,
      incident_id: incidentId || undefined,
    });
    return;
  }

  if (status === 'up' && prevIncidentOpen) {
    const incidentId = await transitionViaDO(env, job, 'up');
    await enqueueAlert(env, {
      alert_id: randomId('al'),
      team_id: job.team_id,
      monitor_id: job.monitor_id,
      status: 'up',
      reason: 'Recovered',
      incident_id: incidentId || undefined,
    });
    return;
  }
}

async function writeCheckEvent(
  env: Env,
  job: CheckJob,
  status: 'up' | 'down',
  latency_ms: number | null,
  reason?: string
) {
  if (!env.AE) return;
  env.AE.writeDataPoint({
    blobs: [job.team_id, job.monitor_id, status, reason || ''],
    doubles: [latency_ms ?? 0],
    indexes: ['team_id', 'monitor_id', 'status', 'reason', 'latency_ms'],
  } as any);
}

async function enqueueAlert(env: Env, alert: AlertJob) {
  await env.ALERT_JOBS.send(alert);
}

async function transitionViaDO(
  env: Env,
  job: CheckJob,
  status: 'up' | 'down',
  reason?: string
): Promise<string | null> {
  try {
    const id = env.INCIDENT_DO.idFromName(`${job.team_id}:${job.monitor_id}`);
    const stub = env.INCIDENT_DO.get(id);
    const res = await stub.fetch('https://do/transition', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team_id: job.team_id,
        monitor_id: job.monitor_id,
        status,
        reason,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json<any>();
    return data.incident_id || null;
  } catch {
    return null;
  }
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
