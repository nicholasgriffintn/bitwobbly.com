import { isRecord } from "../type-guards.ts";

export function extractAiUsageFromResponsePayload(
  payload: unknown
): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.usage)) return payload.usage;
  if (isRecord(payload.result)) {
    return extractAiUsageFromResponsePayload(payload.result);
  }
  return null;
}

export function parseAiUsageFromSsePayload(
  payload: string
): Record<string, unknown> | null {
  if (!payload || payload === "[DONE]") return null;
  try {
    return extractAiUsageFromResponsePayload(JSON.parse(payload));
  } catch {
    return null;
  }
}
