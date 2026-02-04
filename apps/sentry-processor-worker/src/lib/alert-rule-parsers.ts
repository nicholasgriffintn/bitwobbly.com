import type { AlertConditions, AlertThreshold } from "@bitwobbly/shared";

import {
  isRecord,
  parseStringArray,
  parseStringRecord,
  safeJsonParse,
} from "./guards";

export function parseAlertConditions(
  json: string | null
): AlertConditions | null {
  if (!json) return null;
  const parsed = safeJsonParse(json);
  if (!isRecord(parsed)) return null;

  const out: AlertConditions = {};

  const levels = parseStringArray(parsed.level);
  if (levels) {
    const filtered: Array<"error" | "warning" | "info" | "debug"> = [];
    for (const l of levels) {
      if (l === "error" || l === "warning" || l === "info" || l === "debug") {
        filtered.push(l);
      }
    }
    if (filtered.length) out.level = filtered;
  }

  const envs = parseStringArray(parsed.environment);
  if (envs && envs.length) out.environment = envs;

  const tags = parseStringRecord(parsed.tags);
  if (tags) out.tags = tags;

  if (typeof parsed.issueAge === "string") out.issueAge = parsed.issueAge;
  if (typeof parsed.release === "string") out.release = parsed.release;

  const eventTypes = parseStringArray(parsed.eventType);
  if (eventTypes) {
    const filtered: Array<"error" | "default"> = [];
    for (const t of eventTypes) {
      if (t === "error" || t === "default") {
        filtered.push(t);
      }
    }
    if (filtered.length) out.eventType = filtered;
  }

  return out;
}

export function parseAlertThreshold(
  json: string | null
): AlertThreshold | null {
  if (!json) return null;
  const parsed = safeJsonParse(json);
  if (!isRecord(parsed)) return null;

  const type = typeof parsed.type === "string" ? parsed.type : null;
  const windowSeconds =
    typeof parsed.windowSeconds === "number" &&
    Number.isFinite(parsed.windowSeconds)
      ? parsed.windowSeconds
      : null;
  const metric = typeof parsed.metric === "string" ? parsed.metric : null;
  const critical =
    typeof parsed.critical === "number" && Number.isFinite(parsed.critical)
      ? parsed.critical
      : null;

  if (
    (type !== "static" && type !== "percent_change") ||
    windowSeconds === null ||
    (metric !== "count" &&
      metric !== "count_unique_users" &&
      metric !== "avg_events_per_hour") ||
    critical === null
  ) {
    return null;
  }

  const out: AlertThreshold = {
    type,
    windowSeconds,
    metric,
    critical,
  };

  if (typeof parsed.warning === "number" && Number.isFinite(parsed.warning)) {
    out.warning = parsed.warning;
  }
  if (typeof parsed.resolved === "number" && Number.isFinite(parsed.resolved)) {
    out.resolved = parsed.resolved;
  }
  if (typeof parsed.comparisonWindow === "string") {
    const v = parsed.comparisonWindow;
    if (v === "1h" || v === "1d" || v === "1w" || v === "30d") {
      out.comparisonWindow = v;
    }
  }

  return out;
}

export function normaliseLevel(
  level: string
): "error" | "warning" | "info" | "debug" | null {
  const v = level.toLowerCase();
  if (v === "error" || v === "warning" || v === "info" || v === "debug") {
    return v;
  }
  return null;
}

export function extractUserId(user: unknown): string | null {
  if (!isRecord(user)) return null;
  const id = typeof user.id === "string" ? user.id : null;
  const email = typeof user.email === "string" ? user.email : null;
  const ip = typeof user.ip_address === "string" ? user.ip_address : null;
  return id || email || ip;
}
