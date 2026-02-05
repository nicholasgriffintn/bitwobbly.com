import { withSentry } from "@sentry/cloudflare";
import {
  CACHE_TTL,
  createLogger,
  getDb,
  serialiseError,
} from "@bitwobbly/shared";
import { extractJsonFromEnvelope } from "./lib/envelope";
import {
  computeFingerprint,
  generateTitle,
  extractCulprit,
} from "./lib/fingerprint";
import { evaluateAlertRules } from "./lib/alert-rules";
import { parseProcessJob } from "./lib/process-job";
import {
  parseClientReportPayload,
  parseSentryEvent,
  parseSessionPayload,
  type SentryEvent,
} from "./lib/sentry-payloads";
import { parseOtlpLogs, parseOtlpTraces } from "./lib/otlp";
import { createGroupingRulesResolver } from "./lib/grouping-rules";
import {
  upsertIssue,
  insertEvent,
  insertSession,
  insertClientReport,
  eventExists,
  listIssueGroupingRules,
} from "./repositories/events";
import { getProjectTeamId } from "./repositories/alert-rules";
import type { Env, ProcessJob } from "./types/env";
import { assertEnv } from "./types/env";
import {
  deriveAggregateStatus,
  normaliseSessionStatus,
  toUnixSeconds,
} from "./lib/session-utils";

const logger = createLogger({ service: "sentry-processor-worker" });

const groupingRulesResolver = createGroupingRulesResolver({
  ttlMs: CACHE_TTL.GROUPING_RULES,
  listRules: listIssueGroupingRules,
});

const handler = {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    assertEnv(env);
    const db = getDb(env.DB, { withSentry: true });

    for (const msg of batch.messages) {
      try {
        const job = parseProcessJob(msg.body);
        if (!job) {
          logger.error("invalid job payload, skipping", { body: msg.body });
          msg.ack();
          continue;
        }

        const r2Object = await env.SENTRY_RAW.get(job.r2_raw_key);
        if (!r2Object) {
          logger.error("R2 object not found", { key: job.r2_raw_key });
          msg.ack();
          continue;
        }

        const envelopeBytes = await r2Object.arrayBuffer();
        const contentType = r2Object.httpMetadata?.contentType || null;
        const rawBytes = new Uint8Array(envelopeBytes);

        if (job.item_type === "event" || job.item_type === "transaction") {
          await processEvent(job, rawBytes, env, db);
        } else if (job.item_type === "otlp_trace") {
          await processOtlpTrace(job, rawBytes, contentType, env, db);
        } else if (job.item_type === "otlp_log") {
          await processOtlpLog(job, rawBytes, contentType, env, db);
        } else if (
          job.item_type === "session" ||
          job.item_type === "sessions"
        ) {
          await processSession(job, rawBytes, db);
        } else if (job.item_type === "client_report") {
          await processClientReport(job, rawBytes, db);
        } else {
          logger.warn("skipping unsupported item type", {
            itemType: job.item_type,
          });
        }

        msg.ack();
      } catch (error) {
        logger.error("processing failed", { error: serialiseError(error) });
      }
    }
  },
};

export default withSentry<Env, unknown>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.2,
    beforeSend(event) {
      // Drop all error events to prevent infinite recursion.
      // This worker processes Sentry events, so sending its own errors
      // to Sentry would create a feedback loop.
      return null;
    },
  }),
  handler
);

async function processEvent(
  job: ProcessJob,
  rawBytes: Uint8Array,
  env: Env,
  db: ReturnType<typeof getDb>
) {
  const raw = extractJsonFromEnvelope(rawBytes, job.item_index);

  const event = parseSentryEvent(raw);
  if (!event) {
    logger.error("could not extract event from envelope", {
      projectId: job.project_id,
      itemIndex: job.item_index,
    });
    return;
  }

  const stableEventId =
    typeof job.event_id === "string" && job.event_id.length > 0
      ? job.event_id
      : null;

  if (stableEventId) {
    const exists = await eventExists(db, stableEventId);
    if (exists) {
      return;
    }
  }

  const isTransaction = job.item_type === "transaction";
  const level =
    isTransaction ? "info" : event.level || "error";

  const eventId = stableEventId || crypto.randomUUID();

  await insertDerivedEvent({
    job,
    env,
    db,
    event,
    eventType: job.item_type,
    level,
    eventId,
    receivedAt: job.received_at,
    shouldCreateIssue: !isTransaction,
  });
}

async function processSession(
  job: ProcessJob,
  rawBytes: Uint8Array,
  db: ReturnType<typeof getDb>
) {
  const raw = extractJsonFromEnvelope(rawBytes, job.item_index);

  const sessionData = parseSessionPayload(raw);
  if (!sessionData) {
    logger.error("could not extract session from envelope", {
      projectId: job.project_id,
      itemIndex: job.item_index,
    });
    return;
  }

  const release = sessionData.release || sessionData.attrs?.release || null;
  const environment =
    sessionData.environment || sessionData.attrs?.environment || null;

  if (Array.isArray(sessionData.aggregates) && sessionData.aggregates.length) {
    for (let index = 0; index < sessionData.aggregates.length; index += 1) {
      const aggregate = sessionData.aggregates[index];
      const started = toUnixSeconds(aggregate.started, job.received_at);
      const errorsRaw =
        aggregate.errors ?? aggregate.errored ?? aggregate.crashed;
      const errors =
        typeof errorsRaw === "number" && Number.isFinite(errorsRaw)
          ? Math.max(0, Math.floor(errorsRaw))
          : 0;

      await insertSession(db, {
        projectId: job.project_id,
        sessionId: `${job.manifest_id}:${job.item_index}:${index}`,
        distinctId: typeof aggregate.did === "string" ? aggregate.did : null,
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
      typeof sessionData.errors === "number" &&
      Number.isFinite(sessionData.errors)
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
  rawBytes: Uint8Array,
  db: ReturnType<typeof getDb>
) {
  const raw = extractJsonFromEnvelope(rawBytes, job.item_index);

  const reportData = parseClientReportPayload(raw);
  if (!reportData) {
    logger.error("could not extract client report from envelope", {
      projectId: job.project_id,
      itemIndex: job.item_index,
    });
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
            Number.isFinite(entry.quantity)
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

async function processOtlpTrace(
  job: ProcessJob,
  rawBytes: Uint8Array,
  contentType: string | null,
  env: Env,
  db: ReturnType<typeof getDb>
) {
  const mapped = await parseOtlpTraces(rawBytes);
  if (!mapped.length) {
    logger.warn("could not parse OTLP traces payload", {
      projectId: job.project_id,
      r2Key: job.r2_raw_key,
      contentType,
    });
    return;
  }

  for (const item of mapped) {
    if (!item.shouldCreateIssue && item.eventType !== "transaction") {
      continue;
    }

    const eventId = item.eventId || crypto.randomUUID();
    await insertDerivedEvent({
      job,
      env,
      db,
      event: item.event,
      eventType: item.eventType,
      level: item.level || (item.eventType === "transaction" ? "info" : "error"),
      eventId,
      receivedAt: item.timestamp ?? job.received_at,
      shouldCreateIssue: item.shouldCreateIssue,
    });
  }
}

async function processOtlpLog(
  job: ProcessJob,
  rawBytes: Uint8Array,
  contentType: string | null,
  env: Env,
  db: ReturnType<typeof getDb>
) {
  const mapped = await parseOtlpLogs(rawBytes);
  if (!mapped.length) {
    logger.warn("could not parse OTLP logs payload", {
      projectId: job.project_id,
      r2Key: job.r2_raw_key,
      contentType,
    });
    return;
  }

  for (const item of mapped) {
    if (!item.shouldCreateIssue && item.eventType !== "log") {
      continue;
    }

    const eventId = item.eventId || crypto.randomUUID();
    await insertDerivedEvent({
      job,
      env,
      db,
      event: item.event,
      eventType: item.eventType,
      level: item.level || "info",
      eventId,
      receivedAt: item.timestamp ?? job.received_at,
      shouldCreateIssue: item.shouldCreateIssue,
    });
  }
}

type InsertDerivedEventInput = {
  job: ProcessJob;
  env: Env;
  db: ReturnType<typeof getDb>;
  event: SentryEvent;
  eventType: string;
  level: string;
  eventId: string;
  receivedAt: number;
  shouldCreateIssue?: boolean;
  issueId?: string | null;
  isNewIssue?: boolean;
  wasResolved?: boolean;
  fingerprint?: string;
};

async function insertDerivedEvent({
  job,
  env,
  db,
  event,
  eventType,
  level,
  eventId,
  receivedAt,
  shouldCreateIssue,
  issueId: presetIssueId,
  isNewIssue: presetIsNewIssue,
  wasResolved: presetWasResolved,
  fingerprint: presetFingerprint,
}: InsertDerivedEventInput) {
  if (!event) return;

  const isTransaction = eventType === "transaction";
  const allowIssueCreation =
    shouldCreateIssue !== undefined ? shouldCreateIssue : !isTransaction;

  const baseFingerprint = presetFingerprint ?? computeFingerprint(event);
  const culprit = extractCulprit(event);

  let effectiveFingerprint = baseFingerprint;
  if (allowIssueCreation) {
    const groupingRules = await groupingRulesResolver.getCachedRules(
      db,
      job.project_id
    );
    const overrideFingerprint = groupingRulesResolver.pickOverrideFingerprint(
      groupingRules,
      event,
      culprit
    );
    effectiveFingerprint = overrideFingerprint ?? baseFingerprint;
  }

  let issueId = presetIssueId ?? null;
  let isNewIssue = presetIsNewIssue ?? false;
  let wasResolved = presetWasResolved ?? false;

  if (allowIssueCreation && !issueId) {
    const title = generateTitle(event);
    const result = await upsertIssue(db, job.project_id, {
      fingerprint: effectiveFingerprint,
      title,
      level,
      culprit,
      release: event.release || null,
      environment: event.environment || null,
    });
    issueId = result.issueId;
    isNewIssue = result.isNewIssue;
    wasResolved = result.wasResolved;
  }

  await insertEvent(db, {
    id: eventId,
    projectId: job.project_id,
    issueId,
    type: eventType,
    level,
    message: event.message || null,
    transaction: event.transaction || null,
    fingerprint: effectiveFingerprint,
    release: event.release || null,
    environment: event.environment || null,
    r2Key: job.r2_raw_key,
    receivedAt,
    user: event.user || null,
    tags: event.tags || null,
    contexts: event.contexts || null,
    request: event.request || null,
    exception: event.exception || null,
    breadcrumbs: event.breadcrumbs || null,
  });

  if (!issueId) return;

  const projectTeamId = await getProjectTeamId(db, job.project_id);
  if (!projectTeamId) return;

  await evaluateAlertRules(env, db, {
    eventId,
    issueId,
    projectId: job.project_id,
    teamId: projectTeamId,
    level,
    environment: event.environment,
    release: event.release,
    tags: event.tags,
    eventType,
    isNewIssue,
    wasResolved,
  });
}
