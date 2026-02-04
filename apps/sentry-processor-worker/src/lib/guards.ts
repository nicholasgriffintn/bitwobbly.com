export function isRecord(value: unknown): value is Record<string, {}> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getString(
  obj: Record<string, {}>,
  key: string
): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

export function getNumber(
  obj: Record<string, {}>,
  key: string
): number | undefined {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function getArray(
  obj: Record<string, {}>,
  key: string
): {}[] | undefined {
  const v = obj[key];
  return Array.isArray(v) ? (v as {}[]) : undefined;
}

export function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    out.push(item);
  }
  return out;
}

export function parseStringRecord(
  value: unknown
): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string") return null;
    out[k] = v;
  }
  return out;
}
