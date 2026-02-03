export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isProjectCache(
  value: unknown,
): value is { id: string; teamId: string } {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.teamId === "string";
}

