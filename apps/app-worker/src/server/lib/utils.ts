export function clampInt(
  v: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  const i = Math.floor(n);
  return Math.max(min, Math.min(max, i));
}

export function requireFiniteInt(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${name}`);
  }
  return Math.floor(n);
}

export function requireUnixSeconds(dateValue: string, name: string): number {
  const ms = new Date(dateValue).getTime();
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid ${name}`);
  }
  return Math.floor(ms / 1000);
}

export function clampFiniteInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(n)));
}
