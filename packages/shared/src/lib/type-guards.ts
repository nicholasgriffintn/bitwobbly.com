export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function readStringField(
  value: Record<string, unknown>,
  key: string
): string | null {
  const field = value[key];
  return typeof field === "string" ? field : null;
}
