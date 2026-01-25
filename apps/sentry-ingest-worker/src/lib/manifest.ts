import type { ParsedEnvelope } from "./envelope";

export interface ManifestRecord {
  manifest_id: string;
  sentry_project_id: number;
  project_id: string;
  received_at: number;
  envelope_id?: string;
  item_type: string;
  event_id?: string;
  r2_raw_key: string;
  item_index: number;
  item_length_bytes: number;

  // SDK metadata
  sdk_name?: string;
  sdk_version?: string;

  // Envelope header metadata
  sent_at?: string;
  sent_at_drift_ms?: number;

  // Trace context
  trace_id?: string;
  trace_public_key?: string;
  trace_release?: string;
  trace_environment?: string;
  trace_user_segment?: string;

  // Item header metadata
  item_content_type?: string;
  item_filename?: string;
  item_attachment_type?: string;
  item_count?: number;
  item_platform?: string;

  // Parsed event metadata (for events/transactions)
  event_platform?: string;
  event_level?: string;
  event_release?: string;
  event_environment?: string;
  event_user_id?: string;
  event_transaction?: string;
  event_message?: string;
}

export function buildManifests(
  envelope: ParsedEnvelope,
  projectId: string,
  sentryProjectId: number,
  r2Key: string,
  receivedAt: Date,
): ManifestRecord[] {
  const receivedAtUnix = Math.floor(receivedAt.getTime() / 1000);
  const manifests: ManifestRecord[] = [];

  let sentAtDriftMs: number | undefined;
  if (envelope.header.sent_at) {
    try {
      const sentAtDate = new Date(envelope.header.sent_at);
      sentAtDriftMs = receivedAt.getTime() - sentAtDate.getTime();
    } catch {
      // Invalid sent_at format
    }
  }

  envelope.items.forEach((item, index) => {
    let eventId: string | undefined;
    let eventMetadata: {
      platform?: string;
      level?: string;
      release?: string;
      environment?: string;
      user_id?: string;
      transaction?: string;
      message?: string;
    } = {};

    if (item.type === "event" || item.type === "transaction") {
      try {
        const decoder = new TextDecoder();
        const payloadText = decoder.decode(item.payload);
        const payloadJson = JSON.parse(payloadText);
        eventId = payloadJson.event_id;

        eventMetadata = {
          platform: payloadJson.platform,
          level: payloadJson.level,
          release: payloadJson.release,
          environment: payloadJson.environment,
          user_id: payloadJson.user?.id,
          transaction: payloadJson.transaction,
          message:
            payloadJson.message ||
            payloadJson.exception?.values?.[0]?.value ||
            payloadJson.exception?.values?.[0]?.type,
        };
      } catch {
        // Ignore parse errors
      }
    }

    manifests.push({
      manifest_id: crypto.randomUUID(),
      sentry_project_id: sentryProjectId,
      project_id: projectId,
      received_at: receivedAtUnix,
      envelope_id: envelope.header.event_id,
      item_type: item.type,
      event_id: eventId,
      r2_raw_key: r2Key,
      item_index: index,
      item_length_bytes: item.length ?? 0,
      sdk_name: envelope.header.sdk?.name,
      sdk_version: envelope.header.sdk?.version,
      sent_at: envelope.header.sent_at,
      sent_at_drift_ms: sentAtDriftMs,
      trace_id: envelope.header.trace?.trace_id,
      trace_public_key: envelope.header.trace?.public_key,
      trace_release: envelope.header.trace?.release,
      trace_environment: envelope.header.trace?.environment,
      trace_user_segment: envelope.header.trace?.user_segment,
      item_content_type: item.content_type,
      item_filename: item.filename,
      item_attachment_type: item.attachment_type,
      item_count: item.item_count,
      item_platform: item.platform,
      event_platform: eventMetadata.platform,
      event_level: eventMetadata.level,
      event_release: eventMetadata.release,
      event_environment: eventMetadata.environment,
      event_user_id: eventMetadata.user_id,
      event_transaction: eventMetadata.transaction,
      event_message: eventMetadata.message,
    });
  });

  return manifests;
}
