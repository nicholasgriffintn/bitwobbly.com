import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { TIME_CONSTANTS, createLogger } from "@bitwobbly/shared";

import { Card, CardTitle, PageHeader } from "@/components/layout";
import { ListContainer, ListRow } from "@/components/list";
import { Badge, StatusBadge, isStatusType } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { formatRelativeTime } from "@/utils/time";
import {
  listSentryEventsFn,
  getSentryEventPayloadFn,
  getSentryIssueFn,
  updateSentryIssueFn,
} from "@/server/functions/sentry";
import { listTeamMembersFn } from "@/server/functions/teams";
import { toTitleCase } from "@/utils/format";
import type { Event, Issue, TeamMember } from "@/types/issues";
import { supportsResolution } from "@/types/issues";

const logger = createLogger({ service: "app-worker" });

function buildIssueSummary(issue: Issue) {
  return JSON.stringify(
    {
      id: issue.id,
      title: issue.title,
      level: issue.level,
      status: issue.status,
      eventCount: issue.eventCount,
      firstSeenAt: issue.firstSeenAt,
      lastSeenAt: issue.lastSeenAt,
    },
    null,
    2
  );
}

function buildInvestigatePrompt(issue: Issue, event: Event | undefined) {
  const eventContext = event
    ? `\nLatest event:\n- Event ID: ${event.id}\n- Type: ${event.type}\n- Level: ${event.level ?? "unknown"}\n- Message: ${event.message ?? "n/a"}\n- Received: ${event.receivedAt}\n- Request: ${event.request?.method ?? "n/a"} ${event.request?.url ?? ""}\n`
    : "\nNo event selected yet. Use issue-level signals.\n";

  return `Investigate this production issue and explain likely root causes.

Issue:
- ID: ${issue.id}
- Title: ${issue.title}
- Level: ${issue.level}
- Status: ${issue.status}
- Event count: ${issue.eventCount}
- First seen (unix): ${issue.firstSeenAt}
- Last seen (unix): ${issue.lastSeenAt}${eventContext}
Please provide:
1) Most likely root cause hypotheses (ranked)
2) Signals that support each hypothesis
3) What to check next
4) Short-term mitigation options`;
}

function buildFixPrompt(
  issue: Issue,
  event: Event | undefined,
  payload: string | null
) {
  const payloadExcerpt = payload
    ? payload.slice(0, 12000)
    : "Payload not loaded yet.";
  const eventDetails = event
    ? `Event ID: ${event.id}\nEvent type: ${event.type}\nEvent level: ${event.level ?? "unknown"}\nEvent message: ${event.message ?? "n/a"}`
    : "No event selected.";

  return `You are fixing a production issue. Propose a safe patch plan and code change sketch.

Issue:
- ID: ${issue.id}
- Title: ${issue.title}
- Level: ${issue.level}
- Status: ${issue.status}
- Event count: ${issue.eventCount}

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

export const Route = createFileRoute("/app/issues/$projectId/issue/$issueId")({
  component: IssueDetail,
  loader: async ({ params }) => {
    const [eventsRes, issueRes, membersRes] = await Promise.all([
      listSentryEventsFn({
        data: {
          projectId: params.projectId,
          issueId: params.issueId,
          limit: 100,
        },
      }),
      getSentryIssueFn({
        data: { projectId: params.projectId, issueId: params.issueId },
      }),
      listTeamMembersFn(),
    ]);

    return {
      events: eventsRes.events,
      issue: issueRes.issue,
      members: membersRes.members,
    };
  },
});

function IssueDetail() {
  const { projectId } = Route.useParams();
  const { events, issue, members: membersRaw } = Route.useLoaderData();
  const members = membersRaw as TeamMember[];
  const [issueState, setIssueState] = useState<Issue>(issue);
  const issueSupportsResolution = supportsResolution(issueState.level);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventPayload, setEventPayload] = useState<string | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);
  const [assigneeUserId, setAssigneeUserId] = useState<string>(
    issue.assignedToUserId || ""
  );
  const [isUpdatingIssue, setIsUpdatingIssue] = useState(false);

  const getEventPayload = useServerFn(getSentryEventPayloadFn);
  const updateIssue = useServerFn(updateSentryIssueFn);
  const getIssue = useServerFn(getSentryIssueFn);
  const selectedEvent = events.find(
    (event: Event) => event.id === selectedEventId
  );
  const investigatePrompt = buildInvestigatePrompt(issueState, selectedEvent);
  const fixPrompt = buildFixPrompt(issueState, selectedEvent, eventPayload);
  const now = Math.floor(Date.now() / 1000);

  const memberEmailById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.userId, member.email);
    }
    return map;
  }, [members]);

  const handleViewPayload = async (eventId: string) => {
    setSelectedEventId(eventId);
    setIsLoadingPayload(true);
    try {
      const result = await getEventPayload({
        data: { projectId, eventId },
      });
      setEventPayload(result.payload);
    } catch (err) {
      logger.error("Failed to load payload:", { err });
      setEventPayload("Failed to load event payload");
    } finally {
      setIsLoadingPayload(false);
    }
  };

  const closePayload = () => {
    setSelectedEventId(null);
    setEventPayload(null);
  };

  const applyIssueUpdate = async (patch: {
    status?: "unresolved" | "resolved" | "ignored";
    assignedToUserId?: string | null;
    snoozedUntil?: number | null;
    ignoredUntil?: number | null;
    resolvedInRelease?: string | null;
  }) => {
    setIsUpdatingIssue(true);
    try {
      await updateIssue({
        data: { projectId, issueId: issueState.id, ...patch },
      });
      const res = await getIssue({
        data: { projectId, issueId: issueState.id },
      });
      setIssueState(res.issue);
    } finally {
      setIsUpdatingIssue(false);
    }
  };

  useEffect(() => {
    setAssigneeUserId(issueState.assignedToUserId || "");
  }, [issueState.assignedToUserId]);

  return (
    <div className="page">
      <PageHeader
        title={issue.title}
        description={
          <Link to="/app/issues/$projectId" params={{ projectId }}>
            ← Back to project
          </Link>
        }
        className="mb-6"
      />

      <div className="grid two mb-4">
        <Card>
          <CardTitle>Overview</CardTitle>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {isStatusType(issueState.level) ? (
                <StatusBadge status={issueState.level}>
                  {toTitleCase(issueState.level)}
                </StatusBadge>
              ) : (
                <Badge size="small">{toTitleCase(issueState.level)}</Badge>
              )}
              {issueSupportsResolution && (
                <Badge
                  size="small"
                  variant={
                    issueState.status === "resolved"
                      ? "success"
                      : issueState.status === "ignored"
                        ? "muted"
                        : "danger"
                  }
                >
                  {toTitleCase(issueState.status)}
                </Badge>
              )}
            </div>

            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[color:var(--muted)]">Events</span>
                <span className="font-medium">
                  {issueState.eventCount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--muted)]">First seen</span>
                <span>{formatRelativeTime(issueState.firstSeenAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--muted)]">Last seen</span>
                <span>{formatRelativeTime(issueState.lastSeenAt)}</span>
              </div>
              {issueState.culprit && (
                <div className="flex justify-between gap-4">
                  <span className="flex-shrink-0 text-[color:var(--muted)]">
                    Culprit
                  </span>
                  <span className="truncate font-mono text-xs">
                    {issueState.culprit}
                  </span>
                </div>
              )}
            </div>

            {(issueState.lastSeenRelease || issueState.lastSeenEnvironment) && (
              <div className="flex flex-wrap gap-2">
                {issueState.lastSeenRelease && (
                  <Badge size="small">{issueState.lastSeenRelease}</Badge>
                )}
                {issueState.lastSeenEnvironment && (
                  <Badge size="small" variant="muted">
                    {toTitleCase(issueState.lastSeenEnvironment)}
                  </Badge>
                )}
              </div>
            )}

            {issueState.resolvedInRelease && (
              <div className="text-sm">
                <span className="text-[color:var(--muted)]">Resolved in: </span>
                <Badge size="small" variant="success">
                  {issueState.resolvedInRelease}
                </Badge>
              </div>
            )}

            {issueState.regressedCount > 0 && (
              <div className="text-sm">
                <Badge size="small" variant="warning">
                  Regressed ×{issueState.regressedCount}
                </Badge>
                {issueState.regressedAt && (
                  <span className="ml-2 text-[color:var(--muted)]">
                    {formatRelativeTime(issueState.regressedAt)}
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Actions</CardTitle>
          <div className="space-y-4">
            <div className="button-row">
              {issueSupportsResolution ? (
                issueState.status === "unresolved" ? (
                  <>
                    <button
                      type="button"
                      className="outline button-success"
                      disabled={isUpdatingIssue}
                      onClick={() =>
                        applyIssueUpdate({
                          status: "resolved",
                          resolvedInRelease: issueState.lastSeenRelease ?? null,
                        })
                      }
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      className="outline button-warning"
                      disabled={isUpdatingIssue}
                      onClick={() =>
                        applyIssueUpdate({
                          status: "ignored",
                          ignoredUntil: now + TIME_CONSTANTS.ONE_WEEK_SECONDS,
                        })
                      }
                    >
                      Ignore 7d
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="outline"
                    disabled={isUpdatingIssue}
                    onClick={() =>
                      applyIssueUpdate({
                        status: "unresolved",
                        ignoredUntil: null,
                        resolvedInRelease: null,
                      })
                    }
                  >
                    Reopen
                  </button>
                )
              ) : null}
              {issueState.snoozedUntil && issueState.snoozedUntil > now ? (
                <button
                  type="button"
                  className="outline"
                  disabled={isUpdatingIssue}
                  onClick={() => applyIssueUpdate({ snoozedUntil: null })}
                >
                  Unsnooze
                </button>
              ) : (
                <button
                  type="button"
                  className="outline"
                  disabled={isUpdatingIssue}
                  onClick={() =>
                    applyIssueUpdate({ snoozedUntil: now + 60 * 60 })
                  }
                >
                  Snooze 1h
                </button>
              )}
            </div>

            <div className="border-t border-[color:var(--stroke)] pt-4">
              <div className="mb-2 text-sm text-[color:var(--muted)]">
                Assignee:{" "}
                <span className="text-[color:var(--ink)]">
                  {issueState.assignedToUserId
                    ? (memberEmailById.get(issueState.assignedToUserId) ??
                      "Assigned")
                    : "Unassigned"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={assigneeUserId}
                  onChange={(e) => setAssigneeUserId(e.target.value)}
                  className="flex-1"
                  disabled={isUpdatingIssue}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.email}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="outline"
                  disabled={isUpdatingIssue}
                  onClick={() =>
                    applyIssueUpdate({
                      assignedToUserId: assigneeUserId || null,
                    })
                  }
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <CardTitle>AI Prompts</CardTitle>
        <div className="button-row">
          <CopyButton
            text={buildIssueSummary(issueState)}
            label="Copy issue JSON"
          />
          <CopyButton
            text={investigatePrompt}
            label="Copy AI investigate prompt"
          />
          <CopyButton text={fixPrompt} label="Copy AI fix prompt" />
        </div>
        <div className="muted mt-2">
          Load an event payload for richer AI fix prompts.
        </div>
      </Card>

      <Card>
        <CardTitle>Events ({events.length})</CardTitle>
        <ListContainer
          isEmpty={!events.length}
          emptyMessage="No events found for this issue."
        >
          {events.map((event: Event) => (
            <ListRow
              key={event.id}
              className="list-item-expanded"
              title={event.message || `${event.type} event`}
              badges={
                event.level && isStatusType(event.level) ? (
                  <StatusBadge status={event.level}>{event.level}</StatusBadge>
                ) : event.level ? (
                  <Badge size="small">{event.level}</Badge>
                ) : null
              }
              subtitle={
                <div className="space-y-2">
                  <div>
                    {formatRelativeTime(event.receivedAt)}
                    {event.user?.email && <> · User: {event.user.email}</>}
                    {event.request?.url && (
                      <>
                        {" · "}
                        {event.request.method} {event.request.url}
                      </>
                    )}
                  </div>
                  {event.tags && Object.keys(event.tags).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(event.tags).map(([key, value]) => (
                        <Badge key={key} size="small" variant="muted">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {event.breadcrumbs && event.breadcrumbs.length > 0 && (
                    <div className="mt-2 text-xs">
                      <strong>Breadcrumbs:</strong>
                      {event.breadcrumbs.slice(-3).map((crumb, idx) => (
                        <div
                          key={idx}
                          className="mt-0.5 text-[color:var(--muted)]"
                        >
                          [{crumb.category}] {crumb.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              }
              subtitleClassName="muted mt-1"
              actions={
                <button
                  type="button"
                  onClick={() => handleViewPayload(event.id)}
                  className="outline text-sm"
                >
                  View Payload
                </button>
              }
              expanded={selectedEventId === event.id}
              expandedContent={
                selectedEventId === event.id && (
                  <div className="min-w-0 border-t border-[color:var(--stroke)] bg-[color:var(--surface-1)] p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <strong>Event Payload</strong>
                      <div className="button-row">
                        <CopyButton
                          text={eventPayload || ""}
                          label="Copy payload"
                          disabled={isLoadingPayload || !eventPayload}
                        />
                        <CopyButton
                          text={buildInvestigatePrompt(issue, event)}
                          label="Copy AI investigate prompt"
                          disabled={isLoadingPayload}
                        />
                        <CopyButton
                          text={buildFixPrompt(issue, event, eventPayload)}
                          label="Copy AI fix prompt"
                          disabled={isLoadingPayload}
                        />
                        <button
                          type="button"
                          onClick={closePayload}
                          className="outline button-mini"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    {isLoadingPayload ? (
                      <div>Loading payload...</div>
                    ) : (
                      <pre className="max-h-[400px] w-full max-w-full overflow-auto whitespace-pre-wrap break-all rounded bg-white p-4 text-sm">
                        {eventPayload}
                      </pre>
                    )}
                  </div>
                )
              }
            />
          ))}
        </ListContainer>
      </Card>
    </div>
  );
}
