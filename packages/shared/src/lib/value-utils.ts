export function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isPathAllowedByPrefixes(path: string, allowed: string[]): boolean {
  if (!allowed.length) return true;
  return allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let out = "";
  for (let index = 0; index < bytes.length; index += 4096) {
    const chunk = bytes.slice(index, index + 4096);
    out += String.fromCharCode(...chunk);
  }
  return btoa(out);
}
