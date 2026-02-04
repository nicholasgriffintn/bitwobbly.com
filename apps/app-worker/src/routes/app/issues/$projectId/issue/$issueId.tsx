import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/layout";
import { CopyButton } from "@/components/CopyButton";
import { formatRelativeTime } from "@/utils/time";
import {
  listSentryEventsFn,
  getSentryEventPayloadFn,
  getSentryIssueFn,
} from "@/server/functions/sentry";
import { toTitleCase } from "@/utils/format";

const supportsResolution = (level: string) =>
  level === "error" || level === "warning";

type Event = {
  id: string;
  type: string;
  level: string | null;
  message: string | null;
  receivedAt: number;
  issueId: string | null;
  user?: {
    id?: string;
    username?: string;
    email?: string;
    ip_address?: string;
  } | null;
  tags?: Record<string, string> | null;
  contexts?: {
    device?: { [key: string]: {} };
    os?: { [key: string]: {} };
    runtime?: { [key: string]: {} };
    browser?: { [key: string]: {} };
    app?: { [key: string]: {} };
  } | null;
  request?: {
    url?: string;
    method?: string;
  } | null;
  breadcrumbs?: Array<{
    timestamp?: string;
    type?: string;
    category?: string;
    message?: string;
    level?: string;
  }> | null;
};

type Issue = {
  id: string;
  title: string;
  level: string;
  status: string;
  eventCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
};

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
    const [eventsRes, issueRes] = await Promise.all([
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
    ]);

    return { events: eventsRes.events, issue: issueRes.issue };
  },
});

function IssueDetail() {
  const { projectId } = Route.useParams();
  const { events, issue } = Route.useLoaderData();
  const issueSupportsResolution = supportsResolution(issue.level);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventPayload, setEventPayload] = useState<string | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);

  const getEventPayload = useServerFn(getSentryEventPayloadFn);
  const selectedEvent = events.find(
    (event: Event) => event.id === selectedEventId
  );
  const investigatePrompt = buildInvestigatePrompt(issue, selectedEvent);
  const fixPrompt = buildFixPrompt(issue, selectedEvent, eventPayload);

  const handleViewPayload = async (eventId: string) => {
    setSelectedEventId(eventId);
    setIsLoadingPayload(true);
    try {
      const result = await getEventPayload({
        data: { projectId, eventId },
      });
      setEventPayload(result.payload);
    } catch (err) {
      console.error("Failed to load payload:", err);
      setEventPayload("Failed to load event payload");
    } finally {
      setIsLoadingPayload(false);
    }
  };

  const closePayload = () => {
    setSelectedEventId(null);
    setEventPayload(null);
  };

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

      <div className="card mb-4">
        <div className="card-title">Issue Details</div>
        <div className="p-4">
          {issueSupportsResolution && (
            <div className="mb-2">
              <strong>Status:</strong>{" "}
              <span className="pill small">{toTitleCase(issue.status)}</span>
            </div>
          )}
          <div className="mb-2">
            <strong>Level:</strong>{" "}
            <span className={`status ${issue.level}`}>
              {toTitleCase(issue.level)}
            </span>
          </div>
          <div className="mb-2">
            <strong>Event Count:</strong> {issue.eventCount}
          </div>
          <div className="mb-2">
            <strong>First Seen:</strong> {formatRelativeTime(issue.firstSeenAt)}
          </div>
          <div>
            <strong>Last Seen:</strong> {formatRelativeTime(issue.lastSeenAt)}
          </div>
          <div className="button-row mt-3">
            <CopyButton
              text={buildIssueSummary(issue)}
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
        </div>
      </div>

      <div className="card">
        <div className="card-title">Events ({events.length})</div>
        <div className="list">
          {events.length ? (
            events.map((event: Event) => (
              <div key={event.id}>
                <div className="list-item-expanded">
                  <div className="list-row">
                    <div className="flex-1">
                      <div className="list-title">
                        {event.message || `${event.type} event`}
                      </div>
                      <div className="muted mt-1">
                        {event.level && (
                          <>
                            <span className={`status ${event.level}`}>
                              {event.level}
                            </span>
                            {" · "}
                          </>
                        )}
                        {formatRelativeTime(event.receivedAt)}
                        {event.user?.email && (
                          <>
                            {" · "}
                            User: {event.user.email}
                          </>
                        )}
                        {event.request?.url && (
                          <>
                            {" · "}
                            {event.request.method} {event.request.url}
                          </>
                        )}
                      </div>
                      {event.tags && Object.keys(event.tags).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Object.entries(event.tags).map(([key, value]) => (
                            <span key={key} className="pill small">
                              {key}: {value}
                            </span>
                          ))}
                        </div>
                      )}
                      {event.contexts && (
                        <div className="muted mt-2 text-sm">
                          {event.contexts.browser && (
                            <div>
                              Browser: {JSON.stringify(event.contexts.browser)}
                            </div>
                          )}
                          {event.contexts.os && (
                            <div>OS: {JSON.stringify(event.contexts.os)}</div>
                          )}
                          {event.contexts.device && (
                            <div>
                              Device: {JSON.stringify(event.contexts.device)}
                            </div>
                          )}
                        </div>
                      )}
                      {event.breadcrumbs && event.breadcrumbs.length > 0 && (
                        <div className="mt-3">
                          <strong className="text-sm">Breadcrumbs:</strong>
                          <div className="mt-1">
                            {event.breadcrumbs.slice(-5).map((crumb, idx) => (
                              <div key={idx} className="muted mt-0.5 text-sm">
                                [{crumb.category}] {crumb.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleViewPayload(event.id)}
                      className="outline text-sm"
                    >
                      View Payload
                    </button>
                  </div>
                </div>
                {selectedEventId === event.id && (
                  <div className="border-t border-[color:var(--stroke)] bg-[color:var(--surface-1)] p-4">
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
                      <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap break-words rounded bg-white p-4 text-sm">
                        {eventPayload}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="muted">No events found for this issue.</div>
          )}
        </div>
      </div>
    </div>
  );
}
