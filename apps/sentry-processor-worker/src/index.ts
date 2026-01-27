import { withSentry } from "@sentry/cloudflare";

import { getDb } from "./lib/db";
import {
  computeFingerprint,
  generateTitle,
  extractCulprit,
} from "./lib/fingerprint";
import { upsertIssue, insertEvent } from "./repositories/events";
import type { Env, ProcessJob } from "./types/env";

interface SentryEvent {
  level?: string;
  message?: string;
  release?: string;
  environment?: string;
  user?: {
    id?: string;
    username?: string;
    email?: string;
    ip_address?: string;
  };
  tags?: Record<string, string>;
  contexts?: {
    device?: { [key: string]: {} };
    os?: { [key: string]: {} };
    runtime?: { [key: string]: {} };
    browser?: { [key: string]: {} };
    app?: { [key: string]: {} };
  };
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    data?: {};
  };
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      mechanism?: { [key: string]: {} };
      stacktrace?: { [key: string]: {} };
    }>;
  };
  breadcrumbs?: Array<{
    timestamp?: string;
    type?: string;
    category?: string;
    message?: string;
    level?: string;
    data?: { [key: string]: {} };
  }>;
}

const handler = {
  async queue(batch: MessageBatch<ProcessJob>, env: Env): Promise<void> {
    const db = getDb(env.DB);

    for (const msg of batch.messages) {
      try {
        if (
          msg.body.item_type === 'event' ||
          msg.body.item_type === 'transaction'
        ) {
          await processEvent(msg.body, env, db);
        } else if (
          msg.body.item_type === 'session' ||
          msg.body.item_type === 'sessions'
        ) {
          await processSession(msg.body, env, db);
        } else if (msg.body.item_type === 'client_report') {
          await processClientReport(msg.body, env, db);
        } else {
          console.error(
            `[SENTRY-PROCESSOR] Skipping unsupported type: ${msg.body.item_type}`,
          );
        }

        msg.ack();
      } catch (error) {
        console.error('[SENTRY-PROCESSOR] Processing failed', error);
      }
    }
  },
};

export default withSentry(
  () => ({
    dsn: "https://33a63e6607f84daba8582fde0acfe117@ingest.bitwobbly.com/6",
    environment: "production",
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
  const event = extractEventFromEnvelope(
    new Uint8Array(envelopeBytes),
    job.item_index,
  );

  if (!event) {
    console.error("[SENTRY-PROCESSOR] Could not extract event from envelope");
    return;
  }

  const fingerprint = computeFingerprint(event);
  const title = generateTitle(event);
  const culprit = extractCulprit(event);
  const level =
    job.item_type === "transaction" ? "info" : event.level || "error";

  const issueId = await upsertIssue(db, job.project_id, {
    fingerprint,
    title,
    level,
    culprit,
  });

  await insertEvent(db, {
    id: job.event_id || crypto.randomUUID(),
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
}

function extractEventFromEnvelope(
  data: Uint8Array,
  itemIndex: number,
): SentryEvent | null {
  const decoder = new TextDecoder();
  let offset = 0;

  const headerEnd = data.indexOf(0x0a);
  if (headerEnd === -1) return null;

  offset = headerEnd + 1;

  let currentItem = 0;
  while (offset < data.length) {
    const itemHeaderEnd = data.indexOf(0x0a, offset);
    if (itemHeaderEnd === -1) break;

    const itemHeaderJson = decoder.decode(data.slice(offset, itemHeaderEnd));
    const itemHeader = JSON.parse(itemHeaderJson);
    offset = itemHeaderEnd + 1;

    let length: number;
    let payload: Uint8Array;

    if (itemHeader.length !== undefined) {
      length = itemHeader.length;
      payload = data.slice(offset, offset + length);
      offset += length + 1;
    } else {
      const payloadEnd = data.indexOf(0x0a, offset);
      if (payloadEnd === -1) {
        payload = data.slice(offset);
        offset = data.length;
      } else {
        payload = data.slice(offset, payloadEnd);
        offset = payloadEnd + 1;
      }
      length = payload.length;
    }

    if (currentItem === itemIndex) {
      try {
        const payloadText = decoder.decode(payload);
        return JSON.parse(payloadText);
      } catch {
        return null;
      }
    }

    currentItem++;
  }

  return null;
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
  const sessionData = extractEventFromEnvelope(
    new Uint8Array(envelopeBytes),
    job.item_index,
  );

  if (!sessionData) {
    console.error('[SENTRY-PROCESSOR] Could not extract session from envelope');
    return;
  }
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
  const reportData = extractEventFromEnvelope(
    new Uint8Array(envelopeBytes),
    job.item_index,
  );

  if (!reportData) {
    console.error(
      '[SENTRY-PROCESSOR] Could not extract client report from envelope',
    );
    return;
  }
}
