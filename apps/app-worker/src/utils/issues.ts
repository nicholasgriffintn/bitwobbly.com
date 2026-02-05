import type { Event, Issue } from "@/types/issues";

const FALLBACK = "-";

export function formatTimestamp(timestamp?: number | null) {
  if (!timestamp) return FALLBACK;
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return FALLBACK;
  return date.toLocaleString();
}

export function formatIsoTimestamp(value?: string | null) {
  if (!value) return FALLBACK;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatValue(value: unknown) {
  if (value === null || value === undefined) return FALLBACK;
  if (typeof value === "string") return value.length ? value : FALLBACK;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function getTopEntries(map: Map<string, number>, limit = 6) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export function buildIssueSummary(issue: Issue) {
  return JSON.stringify(
    {
      id: issue.id,
      fingerprint: issue.fingerprint,
      title: issue.title,
      level: issue.level,
      status: issue.status,
      culprit: issue.culprit,
      assignedToUserId: issue.assignedToUserId,
      resolvedInRelease: issue.resolvedInRelease,
      regressedCount: issue.regressedCount,
      eventCount: issue.eventCount,
      userCount: issue.userCount,
      firstSeenAt: issue.firstSeenAt,
      lastSeenAt: issue.lastSeenAt,
      lastSeenRelease: issue.lastSeenRelease,
      lastSeenEnvironment: issue.lastSeenEnvironment,
      snoozedUntil: issue.snoozedUntil,
      ignoredUntil: issue.ignoredUntil,
      resolvedAt: issue.resolvedAt,
    },
    null,
    2
  );
}

export function buildInvestigatePrompt(
  issue: Issue,
  event: Event | undefined
) {
  const tagSummary = event?.tags
    ? Object.entries(event.tags)
        .slice(0, 12)
        .map(([key, value]) => `${key}:${value}`)
        .join(", ")
    : "n/a";
  const userSummary = event?.user
    ? event.user.email || event.user.username || event.user.id || "unknown"
    : "n/a";
  const eventContext = event
    ? `\nLatest event:\n- Event ID: ${event.id}\n- Type: ${event.type}\n- Level: ${event.level ?? "unknown"}\n- Message: ${event.message ?? "n/a"}\n- Received (unix): ${event.receivedAt}\n- Release: ${event.release ?? "n/a"}\n- Environment: ${event.environment ?? "n/a"}\n- Transaction: ${event.transaction ?? "n/a"}\n- User: ${userSummary}\n- Request: ${event.request?.method ?? "n/a"} ${event.request?.url ?? ""}\n- Tags: ${tagSummary}\n`
    : "\nNo event selected yet. Use issue-level signals.\n";

  return `Investigate this production issue and explain likely root causes.

Issue:
- ID: ${issue.id}
- Fingerprint: ${issue.fingerprint}
- Title: ${issue.title}
- Level: ${issue.level}
- Status: ${issue.status}
- Culprit: ${issue.culprit ?? "n/a"}
- Event count: ${issue.eventCount}
- User count: ${issue.userCount}
- First seen (unix): ${issue.firstSeenAt}
- Last seen (unix): ${issue.lastSeenAt}
- Last release: ${issue.lastSeenRelease ?? "n/a"}
- Last environment: ${issue.lastSeenEnvironment ?? "n/a"}
- Regressed count: ${issue.regressedCount}${eventContext}
Please provide:
1) Most likely root cause hypotheses (ranked)
2) Signals that support each hypothesis
3) What to check next
4) Short-term mitigation options`;
}

export function buildFixPrompt(
  issue: Issue,
  event: Event | undefined,
  payload: string | null
) {
  const payloadExcerpt = payload
    ? payload.slice(0, 12000)
    : "Payload not loaded yet.";
  const tagSummary = event?.tags
    ? Object.entries(event.tags)
        .slice(0, 12)
        .map(([key, value]) => `${key}:${value}`)
        .join(", ")
    : "n/a";
  const userSummary = event?.user
    ? event.user.email || event.user.username || event.user.id || "unknown"
    : "n/a";
  const eventDetails = event
    ? `Event ID: ${event.id}\nEvent type: ${event.type}\nEvent level: ${event.level ?? "unknown"}\nEvent message: ${event.message ?? "n/a"}\nEvent release: ${event.release ?? "n/a"}\nEvent environment: ${event.environment ?? "n/a"}\nEvent transaction: ${event.transaction ?? "n/a"}\nEvent user: ${userSummary}\nEvent tags: ${tagSummary}`
    : "No event selected.";

  return `You are fixing a production issue. Propose a safe patch plan and code change sketch.

Issue:
- ID: ${issue.id}
- Fingerprint: ${issue.fingerprint}
- Title: ${issue.title}
- Level: ${issue.level}
- Status: ${issue.status}
- Culprit: ${issue.culprit ?? "n/a"}
- Event count: ${issue.eventCount}
- User count: ${issue.userCount}

Event:
${eventDetails}

Payload excerpt:
${payloadExcerpt}

Output:
1) Probable root cause
2) Concrete code-level fix
3) Regression risks
4) Minimal test plan for the fix`;
}
