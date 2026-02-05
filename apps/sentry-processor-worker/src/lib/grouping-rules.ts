import type { DB } from "@bitwobbly/shared";
import type { SentryEvent } from "./sentry-payloads";
import { CACHE_TTL } from "@bitwobbly/shared";

type GroupingRule = {
  id: string;
  fingerprint: string;
  matchers: {
    exceptionType?: string;
    level?: string;
    messageIncludes?: string;
    culpritIncludes?: string;
    transactionIncludes?: string;
    frameIncludes?: string;
  } | null;
};

export function createGroupingRulesResolver(options: {
  ttlMs?: number;
  listRules: (db: DB, projectId: string) => Promise<GroupingRule[]>;
}) {
  const ttlMs = options.ttlMs ?? CACHE_TTL.GROUPING_RULES;
  const cache = new Map<
    string,
    { loadedAtMs: number; rules: GroupingRule[] }
  >();

  async function getCachedRules(db: DB, projectId: string) {
    const cached = cache.get(projectId);
    const now = Date.now();

    if (cached && now - cached.loadedAtMs < ttlMs) {
      return cached.rules;
    }

    const rules = await options.listRules(db, projectId);
    cache.set(projectId, { loadedAtMs: now, rules });
    return rules;
  }

  function pickOverrideFingerprint(
    rules: GroupingRule[],
    event: SentryEvent,
    culprit: string | null
  ): string | null {
    if (!rules.length) return null;

    const framesHaystack = getStackFrameSignatures(event)
      .map((frame) => frame.toLowerCase())
      .join(" ");
    const exceptionType =
      typeof event.exception?.values?.[0]?.type === "string"
        ? event.exception.values[0].type
        : null;
    const exceptionValue =
      typeof event.exception?.values?.[0]?.value === "string"
        ? event.exception.values[0].value
        : null;

    const messageHaystack = `${event.message ?? ""} ${exceptionValue ?? ""}`
      .trim()
      .toLowerCase();
    const culpritHaystack = (culprit ?? "").toLowerCase();
    const transactionHaystack = (event.transaction ?? "").toLowerCase();
    const level = (event.level ?? "").toLowerCase();

    for (const rule of rules) {
      const matchers = rule.matchers ?? {};

      if (matchers.exceptionType) {
        if (
          !exceptionType ||
          exceptionType.toLowerCase() !== matchers.exceptionType.toLowerCase()
        ) {
          continue;
        }
      }

      if (matchers.level) {
        if (!level || level !== matchers.level.toLowerCase()) continue;
      }

      if (matchers.messageIncludes) {
        if (!messageHaystack.includes(matchers.messageIncludes.toLowerCase())) {
          continue;
        }
      }

      if (matchers.culpritIncludes) {
        if (!culpritHaystack.includes(matchers.culpritIncludes.toLowerCase())) {
          continue;
        }
      }

      if (matchers.transactionIncludes) {
        if (
          !transactionHaystack.includes(
            matchers.transactionIncludes.toLowerCase()
          )
        ) {
          continue;
        }
      }

      if (matchers.frameIncludes) {
        if (!framesHaystack.includes(matchers.frameIncludes.toLowerCase())) {
          continue;
        }
      }

      return `rule::${rule.id}::${rule.fingerprint}`;
    }

    return null;
  }

  return { getCachedRules, pickOverrideFingerprint };
}

function getStackFrameSignatures(event: SentryEvent): string[] {
  const frames = event.exception?.values?.[0]?.stacktrace?.frames;
  if (!frames?.length) return [];

  const signatures: string[] = [];
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    if (!frame) continue;

    const inApp = (frame as any).in_app;
    if (inApp === false) continue;

    const raw =
      (frame as any).module ||
      (frame as any).function ||
      (frame as any).filename;
    if (typeof raw !== "string" || !raw.trim()) continue;

    signatures.push(normaliseRuleFrameSignature(raw));
    if (signatures.length >= 8) break;
  }

  return signatures;
}

function normaliseRuleFrameSignature(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "unknown";

  const withoutHash = trimmed.split("#")[0] ?? trimmed;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;

  return withoutQuery
    .replace(/^webpack:\/{2,3}/i, "")
    .replace(/^app:\/{2,3}/i, "")
    .replace(/^file:\/{2,3}/i, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\s+/g, " ")
    .trim();
}
