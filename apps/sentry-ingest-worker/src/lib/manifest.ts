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
  sdk_name?: string;
  sdk_version?: string;
}

export function buildManifests(
  envelope: ParsedEnvelope,
  projectId: string,
  sentryProjectId: number,
  r2Key: string,
): ManifestRecord[] {
  const now = Math.floor(Date.now() / 1000);
  const manifests: ManifestRecord[] = [];

  envelope.items.forEach((item, index) => {
    let eventId: string | undefined;

    if (item.type === "event" || item.type === "transaction") {
      try {
        const decoder = new TextDecoder();
        const payloadText = decoder.decode(item.payload);
        const payloadJson = JSON.parse(payloadText);
        eventId = payloadJson.event_id;
      } catch {
        // Ignore parse errors
      }
    }

    manifests.push({
      manifest_id: crypto.randomUUID(),
      sentry_project_id: sentryProjectId,
      project_id: projectId,
      received_at: now,
      envelope_id: envelope.header.event_id,
      item_type: item.type,
      event_id: eventId,
      r2_raw_key: r2Key,
      item_index: index,
      item_length_bytes: item.length ?? 0,
      sdk_name: envelope.header.sdk?.name,
      sdk_version: envelope.header.sdk?.version,
    });
  });

  return manifests;
}
