import { Suspense, useEffect, useMemo, useState } from "react";
import { Await, createFileRoute, defer, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  TIME_CONSTANTS,
  createLogger,
  serialiseError,
} from "@bitwobbly/shared";

import { Card, CardTitle, PageHeader } from "@/components/layout";
import { ListContainer, ListRow } from "@/components/list";
import { Badge, StatusBadge, isStatusType } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";
import { formatRelativeTime } from "@/utils/time";
import {
  buildFixPrompt,
  buildInvestigatePrompt,
  buildIssueSummary,
  formatIsoTimestamp,
  formatTimestamp,
  formatValue,
  getTopEntries,
} from "@/utils/issues";
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

type StackFrameView = {
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  context_line?: string;
};

export const Route = createFileRoute("/app/issues/$projectId/issue/$issueId")({
  component: IssueDetail,
  loader: async ({ params }) => {
    const issuePromise = getSentryIssueFn({
      data: { projectId: params.projectId, issueId: params.issueId },
    }).then((r) => r.issue);

    const eventsPromise = listSentryEventsFn({
      data: {
        projectId: params.projectId,
        issueId: params.issueId,
        limit: 100,
      },
    }).then((r) => r.events);

    const membersPromise = listTeamMembersFn().then((r) => r.members);

    const [events, issue] = await Promise.all([eventsPromise, issuePromise]);

    return {
      events,
      issue,
      membersPromise: defer(membersPromise),
    };
  },
});

function IssueDetail() {
  const { projectId } = Route.useParams();
  const { events, issue, membersPromise } = Route.useLoaderData();
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

  const levelCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      const key = event.level || "unknown";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return getTopEntries(map, 6);
  }, [events]);

  const environmentCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      const key = event.environment || "unknown";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return getTopEntries(map, 5);
  }, [events]);

  const releaseCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      const key = event.release || "unknown";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return getTopEntries(map, 5);
  }, [events]);

  const transactionCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      if (!event.transaction) continue;
      map.set(event.transaction, (map.get(event.transaction) || 0) + 1);
    }
    return getTopEntries(map, 5);
  }, [events]);

  const topTagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      if (!event.tags) continue;
      for (const [key, value] of Object.entries(event.tags)) {
        const normalised = `${key}:${value}`;
        map.set(normalised, (map.get(normalised) || 0) + 1);
      }
    }
    return getTopEntries(map, 10);
  }, [events]);

  const selectedFrames = useMemo<StackFrameView[]>(() => {
    if (!selectedEvent?.exception?.values?.length) return [];

    const frames: StackFrameView[] = [];

    for (const value of selectedEvent.exception.values) {
      if (
        !value.stacktrace ||
        typeof value.stacktrace !== "object" ||
        !("frames" in value.stacktrace)
      ) {
        continue;
      }

      const frameCandidate = value.stacktrace.frames;
      if (!Array.isArray(frameCandidate)) continue;

      for (const frame of frameCandidate) {
        if (!frame || typeof frame !== "object") continue;

        const normalised: StackFrameView = {
          filename:
            "filename" in frame && typeof frame.filename === "string"
              ? frame.filename
              : undefined,
          function:
            "function" in frame && typeof frame.function === "string"
              ? frame.function
              : undefined,
          lineno:
            "lineno" in frame && typeof frame.lineno === "number"
              ? frame.lineno
              : undefined,
          colno:
            "colno" in frame && typeof frame.colno === "number"
              ? frame.colno
              : undefined,
          context_line:
            "context_line" in frame && typeof frame.context_line === "string"
              ? frame.context_line
              : undefined,
        };

        if (
          !normalised.filename &&
          !normalised.function &&
          !normalised.context_line
        ) {
          continue;
        }

        frames.push(normalised);
      }
    }

    return [...frames].reverse().slice(0, 20);
  }, [selectedEvent]);

  const latestEvent = events[0];
  const oldestEvent = events.length > 0 ? events[events.length - 1] : null;

  const handleViewPayload = async (eventId: string) => {
    setSelectedEventId(eventId);
    setIsLoadingPayload(true);
    try {
      const result = await getEventPayload({
        data: { projectId, eventId },
      });
      setEventPayload(result.payload);
    } catch (err) {
      logger.error("Failed to load payload:", { error: serialiseError(err) });
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
    <div className="page-stack issue-detail-page">
      <PageHeader
        title={issueState.title}
        description={
          <span className="issue-breadcrumb">
            <Link to="/app/issues/$projectId" params={{ projectId }}>
              ← Back to project
            </Link>
            <span>|</span>
            <span className="font-mono text-xs">{issueState.id}</span>
          </span>
        }
      />

      <Card className="issue-hero-card">
        <div className="issue-hero-head">
          <div className="flex flex-wrap items-center gap-2">
            {isStatusType(issueState.level) ? (
              <StatusBadge status={issueState.level}>
                {toTitleCase(issueState.level)}
              </StatusBadge>
            ) : (
              <Badge size="small">{toTitleCase(issueState.level)}</Badge>
            )}
            {issueSupportsResolution ? (
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
            ) : null}
            {issueState.regressedCount > 0 ? (
              <Badge size="small" variant="warning">
                Regressed x{issueState.regressedCount}
              </Badge>
            ) : null}
          </div>
          <div className="issue-chip-row">
            <Badge size="small" variant="muted">
              Fingerprint: {issueState.fingerprint}
            </Badge>
            {issueState.lastSeenRelease ? (
              <Badge size="small">Release: {issueState.lastSeenRelease}</Badge>
            ) : null}
            {issueState.lastSeenEnvironment ? (
              <Badge size="small" variant="muted">
                Env: {issueState.lastSeenEnvironment}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="issue-hero-metrics">
          <div className="issue-metric">
            <span className="issue-metric-label">Events</span>
            <span className="issue-metric-value">
              {issueState.eventCount.toLocaleString()}
            </span>
          </div>
          <div className="issue-metric">
            <span className="issue-metric-label">Users</span>
            <span className="issue-metric-value">
              {issueState.userCount.toLocaleString()}
            </span>
          </div>
          <div className="issue-metric">
            <span className="issue-metric-label">First seen</span>
            <span className="issue-metric-value-small">
              {formatRelativeTime(issueState.firstSeenAt)}
            </span>
            <span className="issue-metric-subtext">
              {formatTimestamp(issueState.firstSeenAt)}
            </span>
          </div>
          <div className="issue-metric">
            <span className="issue-metric-label">Last seen</span>
            <span className="issue-metric-value-small">
              {formatRelativeTime(issueState.lastSeenAt)}
            </span>
            <span className="issue-metric-subtext">
              {formatTimestamp(issueState.lastSeenAt)}
            </span>
          </div>
        </div>
      </Card>

      <div className="issue-layout">
        <div className="issue-main-column">
          <Card className="mb-4">
            <CardTitle>Issue Signals</CardTitle>
            <div className="issue-signal-grid">
              <div>
                <p className="issue-subtitle">By level</p>
                <div className="issue-chip-row">
                  {levelCounts.length ? (
                    levelCounts.map(([level, count]) => (
                      <Badge key={level} size="small" variant="muted">
                        {level}: {count}
                      </Badge>
                    ))
                  ) : (
                    <span className="muted">No event levels</span>
                  )}
                </div>
              </div>

              <div>
                <p className="issue-subtitle">Top environments</p>
                <div className="issue-chip-row">
                  {environmentCounts.length ? (
                    environmentCounts.map(([name, count]) => (
                      <Badge key={name} size="small" variant="muted">
                        {name}: {count}
                      </Badge>
                    ))
                  ) : (
                    <span className="muted">No environment data</span>
                  )}
                </div>
              </div>

              <div>
                <p className="issue-subtitle">Top releases</p>
                <div className="issue-chip-row">
                  {releaseCounts.length ? (
                    releaseCounts.map(([name, count]) => (
                      <Badge key={name} size="small" variant="muted">
                        {name}: {count}
                      </Badge>
                    ))
                  ) : (
                    <span className="muted">No release data</span>
                  )}
                </div>
              </div>

              <div>
                <p className="issue-subtitle">Top transactions</p>
                <div className="issue-chip-row">
                  {transactionCounts.length ? (
                    transactionCounts.map(([name, count]) => (
                      <Badge key={name} size="small" variant="muted">
                        {name}: {count}
                      </Badge>
                    ))
                  ) : (
                    <span className="muted">No transaction data</span>
                  )}
                </div>
              </div>
            </div>

            <div className="issue-top-tags">
              <p className="issue-subtitle">Top tags</p>
              <div className="issue-chip-row">
                {topTagCounts.length ? (
                  topTagCounts.map(([name, count]) => (
                    <Badge key={name} size="small" variant="muted">
                      {name} ({count})
                    </Badge>
                  ))
                ) : (
                  <span className="muted">No tags found</span>
                )}
              </div>
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
                  className="list-item-expanded issue-event-row"
                  title={
                    <div className="issue-event-title-wrap">
                      <span className="issue-event-title">
                        {event.message || event.transaction || `${event.type} event`}
                      </span>
                      <span className="issue-event-id font-mono">{event.id}</span>
                    </div>
                  }
                  badges={
                    <div className="issue-chip-row">
                      {event.level && isStatusType(event.level) ? (
                        <StatusBadge status={event.level}>{event.level}</StatusBadge>
                      ) : event.level ? (
                        <Badge size="small">{event.level}</Badge>
                      ) : null}
                      {event.release ? <Badge size="small">{event.release}</Badge> : null}
                      {event.environment ? (
                        <Badge size="small" variant="muted">
                          {event.environment}
                        </Badge>
                      ) : null}
                    </div>
                  }
                  subtitle={
                    <div className="issue-event-meta">
                      <div className="issue-event-meta-line">
                        <span>{formatRelativeTime(event.receivedAt)}</span>
                        <span>{formatTimestamp(event.receivedAt)}</span>
                        {event.user?.email ? <span>User: {event.user.email}</span> : null}
                        {event.user?.id ? <span>User ID: {event.user.id}</span> : null}
                        {event.transaction ? (
                          <span className="font-mono">{event.transaction}</span>
                        ) : null}
                      </div>
                      {event.request?.url ? (
                        <div className="issue-event-meta-line">
                          <span>
                            Request: {event.request.method || "GET"} {event.request.url}
                          </span>
                        </div>
                      ) : null}
                      {event.tags && Object.keys(event.tags).length > 0 ? (
                        <div className="issue-chip-row">
                          {Object.entries(event.tags)
                            .slice(0, 8)
                            .map(([key, value]) => (
                              <Badge key={key} size="small" variant="muted">
                                {key}: {value}
                              </Badge>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  }
                  subtitleClassName="muted mt-1"
                  actions={
                    <button
                      type="button"
                      onClick={() => handleViewPayload(event.id)}
                      className="outline text-sm"
                    >
                      {selectedEventId === event.id ? "Refresh details" : "View details"}
                    </button>
                  }
                  expanded={selectedEventId === event.id}
                  expandedContent={
                    selectedEventId === event.id && (
                      <div className="issue-event-expanded">
                        <div className="issue-event-expanded-toolbar">
                          <strong>Event Diagnostics</strong>
                          <div className="button-row">
                            <CopyButton
                              text={eventPayload || ""}
                              label="Copy payload"
                              disabled={isLoadingPayload || !eventPayload}
                            />
                            <CopyButton
                              text={buildInvestigatePrompt(issueState, event)}
                              label="Copy investigate prompt"
                              disabled={isLoadingPayload}
                            />
                            <CopyButton
                              text={buildFixPrompt(issueState, event, eventPayload)}
                              label="Copy fix prompt"
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

                        <div className="issue-expanded-grid">
                          <section className="issue-expanded-section">
                            <h4>Exception</h4>
                            {event.exception?.values?.length ? (
                              <div className="issue-expanded-list">
                                {event.exception.values.map((value, idx) => (
                                  <div key={`${event.id}-ex-${idx}`}>
                                    <div className="issue-expanded-key">
                                      {value.type || "Error"}
                                    </div>
                                    <div className="issue-expanded-value">
                                      {value.value || "No message"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="muted">No exception values</div>
                            )}
                          </section>

                          <section className="issue-expanded-section">
                            <h4>Stack trace</h4>
                            {selectedFrames.length ? (
                              <div className="issue-expanded-list">
                                {selectedFrames.map((frame, idx) => (
                                  <div key={`${event.id}-frame-${idx}`}>
                                    <div className="issue-expanded-key">
                                      {frame.function || "anonymous"}
                                      {typeof frame.lineno === "number" ? (
                                        <span>
                                          {" "}line {frame.lineno}
                                          {typeof frame.colno === "number"
                                            ? `:${frame.colno}`
                                            : ""}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="issue-expanded-value font-mono">
                                      {frame.filename || "unknown file"}
                                    </div>
                                    {frame.context_line ? (
                                      <pre className="issue-inline-pre">
                                        {frame.context_line}
                                      </pre>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="muted">No stack trace frames</div>
                            )}
                          </section>

                          <section className="issue-expanded-section">
                            <h4>Request</h4>
                            <div className="issue-expanded-list">
                              <div>
                                <div className="issue-expanded-key">Method</div>
                                <div className="issue-expanded-value">
                                  {event.request?.method || "unknown"}
                                </div>
                              </div>
                              <div>
                                <div className="issue-expanded-key">URL</div>
                                <div className="issue-expanded-value break-all">
                                  {event.request?.url || "unknown"}
                                </div>
                              </div>
                              {event.request?.headers ? (
                                <div>
                                  <div className="issue-expanded-key">Headers</div>
                                  <pre className="issue-inline-pre">
                                    {JSON.stringify(event.request.headers, null, 2)}
                                  </pre>
                                </div>
                              ) : null}
                              {event.request?.data ? (
                                <div>
                                  <div className="issue-expanded-key">Body</div>
                                  <pre className="issue-inline-pre">
                                    {JSON.stringify(event.request.data, null, 2)}
                                  </pre>
                                </div>
                              ) : null}
                            </div>
                          </section>

                          <section className="issue-expanded-section">
                            <h4>Contexts</h4>
                            {event.contexts && Object.keys(event.contexts).length ? (
                              <div className="issue-expanded-list">
                                {Object.entries(event.contexts).map(([name, context]) => (
                                  <div key={`${event.id}-ctx-${name}`}>
                                    <div className="issue-expanded-key">{name}</div>
                                    <pre className="issue-inline-pre">
                                      {JSON.stringify(context, null, 2)}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="muted">No context payloads</div>
                            )}
                          </section>

                          <section className="issue-expanded-section">
                            <h4>Breadcrumbs</h4>
                            {event.breadcrumbs?.length ? (
                              <div className="issue-expanded-list">
                                {event.breadcrumbs.map((crumb, idx) => (
                                  <div key={`${event.id}-crumb-${idx}`}>
                                    <div className="issue-expanded-key">
                                      {crumb.category || crumb.type || "default"}
                                    </div>
                                    <div className="issue-expanded-value">
                                      {crumb.message || "No message"}
                                    </div>
                                    <div className="issue-expanded-value">
                                      {formatIsoTimestamp(crumb.timestamp)}
                                      {crumb.level ? ` | ${crumb.level}` : ""}
                                    </div>
                                    {crumb.data ? (
                                      <pre className="issue-inline-pre">
                                        {JSON.stringify(crumb.data, null, 2)}
                                      </pre>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="muted">No breadcrumbs</div>
                            )}
                          </section>
                        </div>

                        <div className="issue-payload-panel">
                          <h4>Raw payload</h4>
                          {isLoadingPayload ? (
                            <div>Loading payload...</div>
                          ) : (
                            <pre className="issue-payload-pre">{eventPayload}</pre>
                          )}
                        </div>
                      </div>
                    )
                  }
                />
              ))}
            </ListContainer>
          </Card>
        </div>

        <div className="issue-sidebar-column">
          <Card className="mb-4">
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
                      applyIssueUpdate({ snoozedUntil: now + TIME_CONSTANTS.ONE_HOUR_SECONDS })
                    }
                  >
                    Snooze 1h
                  </button>
                )}
              </div>

              <div className="border-t border-[color:var(--stroke)] pt-4">
                <Suspense
                  fallback={<div className="muted text-sm">Loading assignees...</div>}
                >
                  <Await promise={membersPromise}>
                    {(members: TeamMember[]) => {
                      const emailById = new Map(
                        members.map((m) => [m.userId, m.email] as const)
                      );
                      return (
                        <>
                          <div className="mb-2 text-sm text-[color:var(--muted)]">
                            Assignee:{" "}
                            <span className="text-[color:var(--ink)]">
                              {issueState.assignedToUserId
                                ? (emailById.get(issueState.assignedToUserId) ||
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
                        </>
                      );
                    }}
                  </Await>
                </Suspense>
              </div>
            </div>
          </Card>

          <Card className="mb-4">
            <CardTitle>Issue Metadata</CardTitle>
            <div className="issue-kv-grid">
              <div className="issue-kv-row">
                <span>ID</span>
                <span className="font-mono text-xs break-all">{issueState.id}</span>
              </div>
              <div className="issue-kv-row">
                <span>Fingerprint</span>
                <span className="font-mono text-xs break-all">
                  {issueState.fingerprint}
                </span>
              </div>
              <div className="issue-kv-row">
                <span>Culprit</span>
                <span className="break-all">{issueState.culprit || "-"}</span>
              </div>
              <div className="issue-kv-row">
                <span>Created</span>
                <span>{formatIsoTimestamp(issueState.createdAt)}</span>
              </div>
              <div className="issue-kv-row">
                <span>Resolved at</span>
                <span>{formatTimestamp(issueState.resolvedAt)}</span>
              </div>
              <div className="issue-kv-row">
                <span>Resolved in release</span>
                <span>{issueState.resolvedInRelease || "-"}</span>
              </div>
              <div className="issue-kv-row">
                <span>Snoozed until</span>
                <span>{formatTimestamp(issueState.snoozedUntil)}</span>
              </div>
              <div className="issue-kv-row">
                <span>Ignored until</span>
                <span>{formatTimestamp(issueState.ignoredUntil)}</span>
              </div>
              <div className="issue-kv-row">
                <span>Latest event</span>
                <span>{latestEvent ? formatTimestamp(latestEvent.receivedAt) : "-"}</span>
              </div>
              <div className="issue-kv-row">
                <span>Oldest event</span>
                <span>{oldestEvent ? formatTimestamp(oldestEvent.receivedAt) : "-"}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>AI Prompts</CardTitle>
            <div className="button-row">
              <CopyButton text={buildIssueSummary(issueState)} label="Copy issue JSON" />
              <CopyButton text={investigatePrompt} label="Copy investigate prompt" />
              <CopyButton text={fixPrompt} label="Copy fix prompt" />
            </div>
            <div className="issue-ai-preview">
              <p className="issue-subtitle">Selected event context</p>
              {selectedEvent ? (
                <div className="issue-kv-grid">
                  <div className="issue-kv-row">
                    <span>Event ID</span>
                    <span className="font-mono text-xs">{selectedEvent.id}</span>
                  </div>
                  <div className="issue-kv-row">
                    <span>Type</span>
                    <span>{selectedEvent.type}</span>
                  </div>
                  <div className="issue-kv-row">
                    <span>Level</span>
                    <span>{selectedEvent.level || "unknown"}</span>
                  </div>
                  <div className="issue-kv-row">
                    <span>Message</span>
                    <span className="break-all">{selectedEvent.message || "-"}</span>
                  </div>
                  <div className="issue-kv-row">
                    <span>Transaction</span>
                    <span className="font-mono text-xs break-all">
                      {selectedEvent.transaction || "-"}
                    </span>
                  </div>
                  <div className="issue-kv-row">
                    <span>User</span>
                    <span>
                      {formatValue(
                        selectedEvent.user?.email ||
                          selectedEvent.user?.username ||
                          selectedEvent.user?.id
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="muted">Open an event to enrich prompt context.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
