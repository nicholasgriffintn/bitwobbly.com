function getNumber(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

export function toUnixSeconds(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
  }

  return fallback;
}

export function normaliseSessionStatus(status?: string): string {
  if (!status) return "unknown";
  const value = status.toLowerCase();
  if (
    value === "ok" ||
    value === "errored" ||
    value === "abnormal" ||
    value === "exited" ||
    value === "crashed"
  ) {
    return value;
  }
  return "unknown";
}

export function deriveAggregateStatus(aggregate: Record<string, unknown>): string {
  if ((getNumber(aggregate, "crashed") ?? 0) !== 0) return "crashed";
  if ((getNumber(aggregate, "errored") ?? 0) !== 0) return "errored";
  if ((getNumber(aggregate, "abnormal") ?? 0) !== 0) return "abnormal";
  if ((getNumber(aggregate, "exited") ?? 0) !== 0) return "exited";
  return "ok";
}

