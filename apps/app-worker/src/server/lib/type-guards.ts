import type { StatusSnapshot } from "../services/status-snapshots";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStatusSnapshot(value: unknown): value is StatusSnapshot {
  if (!isRecord(value)) return false;
  if (typeof value.generated_at !== "string") return false;
  if (!isRecord(value.page)) return false;
  if (typeof value.page.id !== "string") return false;
  if (typeof value.page.name !== "string") return false;
  if (typeof value.page.slug !== "string") return false;
  if (!Array.isArray(value.components)) return false;
  if (!Array.isArray(value.incidents)) return false;
  return true;
}
