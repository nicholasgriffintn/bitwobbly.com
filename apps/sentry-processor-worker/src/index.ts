import { withSentry } from "@sentry/cloudflare";

import { getDb } from "./lib/db";
import { extractJsonFromEnvelope } from "./lib/envelope";
import {
  computeFingerprint,
  generateTitle,
  extractCulprit,
} from "./lib/fingerprint";
import { evaluateAlertRules } from './lib/alert-rules';
import { parseProcessJob } from "./lib/process-job";
import {
  parseClientReportPayload,
  parseSentryEvent,
  parseSessionPayload,
} from "./lib/sentry-payloads";
import {
  upsertIssue,
  insertEvent,
  insertSession,
  insertClientReport,
} from "./repositories/events";
import { getProjectTeamId } from './repositories/alert-rules';
import type { Env, ProcessJob } from "./types/env";

const handler = {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const db = getDb(env.DB);

    for (const msg of batch.messages) {
      try {
        const job = parseProcessJob(msg.body);
        if (!job) {
          console.error(
            "[SENTRY-PROCESSOR] Invalid job payload, skipping",
            msg.body,
          );
          msg.ack();
          continue;
        }

        if (
          job.item_type === 'event' ||
          job.item_type === 'transaction'
        ) {
          await processEvent(job, env, db);
        } else if (
          job.item_type === 'session' ||
          job.item_type === 'sessions'
        ) {
          await processSession(job, env, db);
        } else if (job.item_type === 'client_report') {
          await processClientReport(job, env, db);
        } else {
          console.error(
            `[SENTRY-PROCESSOR] Skipping unsupported type: ${job.item_type}`,
          );
        }

        msg.ack();
      } catch (error) {
        console.error('[SENTRY-PROCESSOR] Processing failed', error);
      }
    }
  },
};

export default withSentry<Env, unknown>(
  () => ({
    dsn: 'https://33a63e6607f84daba8582fde0acfe117@ingest.bitwobbly.com/6',
    environment: 'production',
    tracesSampleRate: 0.2,
    beforeSend(event) {
      return null;
    },
  }),
  handler,
);

async function processEvent(
  job: ProcessJob,
  env: Env,
  db: ReturnType<typeof getDb>,
) {
  const obj = await env.SENTRY_RAW.get(job.r2_raw_key);
  if (!obj) {
    console.error("[SENTRY-PROCESSOR] R2 object not found:", job.r2_raw_key);
    return;
  }

  const envelopeBytes = await obj.arrayBuffer();
  const raw = extractJsonFromEnvelope(
    new Uint8Array(envelopeBytes),
    job.item_index,
  );

  const event = parseSentryEvent(raw);
  if (!event) {
    console.error("[SENTRY-PROCESSOR] Could not extract event from envelope");
    return;
  }

  const fingerprint = computeFingerprint(event);
  const title = generateTitle(event);
  const culprit = extractCulprit(event);
  const level =
    job.item_type === "transaction" ? "info" : event.level || "error";

  const { issueId, isNewIssue, wasResolved } = await upsertIssue(
    db,
    job.project_id,
    {
      fingerprint,
      title,
      level,
      culprit,
    },
  );

  const eventId = job.event_id || crypto.randomUUID();

  await insertEvent(db, {
    id: eventId,
    projectId: job.project_id,
    issueId,
    type: job.item_type,
    level,
    message: event.message || null,
    fingerprint,
    release: event.release || null,
    environment: event.environment || null,
    r2Key: job.r2_raw_key,
    receivedAt: job.received_at,
    user: event.user || null,
    tags: event.tags || null,
    contexts: event.contexts || null,
    request: event.request || null,
    exception: event.exception || null,
    breadcrumbs: event.breadcrumbs || null,
  });

  const projectTeamId = await getProjectTeamId(db, job.project_id);

  if (projectTeamId) {
    await evaluateAlertRules(env, db, {
      eventId,
      issueId,
      projectId: job.project_id,
      teamId: projectTeamId,
      level,
      environment: event.environment,
      release: event.release,
      tags: event.tags,
      eventType: job.item_type,
      isNewIssue,
      wasResolved,
    });
  }
}

function toUnixSeconds(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
  }

  return fallback;
}

function normaliseSessionStatus(status?: string): string {
  if (!status) return "unknown";
  const value = status.toLowerCase();
  if (
    value === "ok" ||
    value === "errored" ||
    value === "abnormal" ||
    value === "exited" ||
    value === "crashed"
  ) {
    return value;
  }
  return "unknown";
}

function deriveAggregateStatus(
  aggregate: Record<string, unknown>,
): string {
  if ((getNumber(aggregate, "crashed") ?? 0) !== 0) return "crashed";
  if ((getNumber(aggregate, "errored") ?? 0) !== 0) return "errored";
  if ((getNumber(aggregate, "abnormal") ?? 0) !== 0) return "abnormal";
  if ((getNumber(aggregate, "exited") ?? 0) !== 0) return "exited";
  return "ok";
}

async function processSession(
  job: ProcessJob,
  env: Env,
  db: ReturnType<typeof getDb>,
) {
  const obj = await env.SENTRY_RAW.get(job.r2_raw_key);
  if (!obj) {
    console.error("[SENTRY-PROCESSOR] R2 object not found:", job.r2_raw_key);
    return;
  }

  const envelopeBytes = await obj.arrayBuffer();
  const raw = extractJsonFromEnvelope(
    new Uint8Array(envelopeBytes),
    job.item_index,
  );

  const sessionData = parseSessionPayload(raw);
  if (!sessionData) {
    console.error('[SENTRY-PROCESSOR] Could not extract session from envelope');
    return;
  }

  const release = sessionData.release || sessionData.attrs?.release || null;
  const environment =
    sessionData.environment || sessionData.attrs?.environment || null;

  if (Array.isArray(sessionData.aggregates) && sessionData.aggregates.length) {
    for (let index = 0; index < sessionData.aggregates.length; index += 1) {
      const aggregate = sessionData.aggregates[index];
      const started = toUnixSeconds(aggregate.started, job.received_at);
      const errorsRaw = aggregate.errors ?? aggregate.errored ?? aggregate.crashed;
      const errors =
        typeof errorsRaw === "number" && Number.isFinite(errorsRaw)
          ? Math.max(0, Math.floor(errorsRaw))
          : 0;

      await insertSession(db, {
        projectId: job.project_id,
        sessionId: `${job.manifest_id}:${job.item_index}:${index}`,
        distinctId:
          typeof aggregate.did === "string" ? aggregate.did : null,
        status: deriveAggregateStatus(aggregate),
        errors,
        started,
        duration:
          typeof aggregate.duration === "number" ? aggregate.duration : null,
        release,
        environment,
        userAgent: null,
        receivedAt: job.received_at,
      });
    }
    return;
  }

  await insertSession(db, {
    projectId: job.project_id,
    sessionId: sessionData.sid || `${job.manifest_id}:${job.item_index}`,
    distinctId: sessionData.did || null,
    status: normaliseSessionStatus(sessionData.status),
    errors:
      typeof sessionData.errors === "number" && Number.isFinite(sessionData.errors)
        ? Math.max(0, Math.floor(sessionData.errors))
        : 0,
    started: toUnixSeconds(sessionData.started, job.received_at),
    duration:
      typeof sessionData.duration === "number" ? sessionData.duration : null,
    release,
    environment,
    userAgent: sessionData.user_agent || sessionData.userAgent || null,
    receivedAt: job.received_at,
  });
}

async function processClientReport(
  job: ProcessJob,
  env: Env,
  db: ReturnType<typeof getDb>,
) {
  const obj = await env.SENTRY_RAW.get(job.r2_raw_key);
  if (!obj) {
    console.error("[SENTRY-PROCESSOR] R2 object not found:", job.r2_raw_key);
    return;
  }

  const envelopeBytes = await obj.arrayBuffer();
  const raw = extractJsonFromEnvelope(
    new Uint8Array(envelopeBytes),
    job.item_index,
  );

  const reportData = parseClientReportPayload(raw);
  if (!reportData) {
    console.error(
      '[SENTRY-PROCESSOR] Could not extract client report from envelope',
    );
    return;
  }

  const discardedEvents = Array.isArray(reportData.discarded_events)
    ? reportData.discarded_events
        .filter(
          (entry) =>
            entry &&
            typeof entry.reason === "string" &&
            typeof entry.category === "string" &&
            typeof entry.quantity === "number" &&
            Number.isFinite(entry.quantity),
        )
        .map((entry) => ({
          reason: entry.reason!,
          category: entry.category!,
          quantity: Math.max(0, Math.floor(entry.quantity!)),
        }))
    : [];

  await insertClientReport(db, {
    projectId: job.project_id,
    timestamp: toUnixSeconds(reportData.timestamp, job.received_at),
    discardedEvents,
    receivedAt: job.received_at,
  });
}
