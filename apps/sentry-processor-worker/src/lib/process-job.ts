import type { ProcessJob } from "../types/env";
import { getNumber, getString, isRecord } from "./guards";

export function parseProcessJob(value: unknown): ProcessJob | null {
  if (!isRecord(value)) return null;

  const manifest_id = getString(value, "manifest_id");
  const project_id = getString(value, "project_id");
  const r2_raw_key = getString(value, "r2_raw_key");
  const item_type = getString(value, "item_type");
  const received_at = getNumber(value, "received_at");
  const item_index = getNumber(value, "item_index");
  const sentry_project_id = getNumber(value, "sentry_project_id");

  if (
    !manifest_id ||
    !project_id ||
    !r2_raw_key ||
    !item_type ||
    received_at === undefined ||
    item_index === undefined ||
    sentry_project_id === undefined
  ) {
    return null;
  }

  const event_id = getString(value, "event_id");

  return {
    manifest_id,
    sentry_project_id,
    project_id,
    received_at,
    item_type,
    event_id: event_id || undefined,
    r2_raw_key,
    item_index,
  };
}
