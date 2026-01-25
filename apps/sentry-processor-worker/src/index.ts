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
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: {
        frames?: Array<{
          filename?: string;
          function?: string;
        }>;
      };
    }>;
  };
}

const handler = {
  async queue(batch: MessageBatch<ProcessJob>, env: Env): Promise<void> {
    console.log(
      `[SENTRY-PROCESSOR] Received batch with ${batch.messages.length} messages`,
    );

    const db = getDb(env.DB);

    for (const msg of batch.messages) {
      try {
        if (
          msg.body.item_type !== "event" &&
          msg.body.item_type !== "transaction"
        ) {
          console.log(
            `[SENTRY-PROCESSOR] Skipping non-event type: ${msg.body.item_type}`,
          );
          msg.ack();
          continue;
        }

        console.log(`[SENTRY-PROCESSOR] Processing event ${msg.body.event_id}`);

        await processEvent(msg.body, env, db);
        msg.ack();
        console.log(
          `[SENTRY-PROCESSOR] Successfully processed event ${msg.body.event_id}`,
        );
      } catch (error) {
        console.error("[SENTRY-PROCESSOR] Processing failed", error);
      }
    }
  },
};

export default withSentry(
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
