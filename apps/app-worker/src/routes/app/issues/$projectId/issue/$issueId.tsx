import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { formatRelativeTime } from "@/utils/time";
import {
  listSentryEventsFn,
  getSentryEventPayloadFn,
  getSentryIssueFn,
} from "@/server/functions/sentry";

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

export const Route = createFileRoute("/app/issues/$projectId/issue/$issueId")({
  component: IssueDetail,
  loader: async ({ params }) => {
    const [eventsRes, issueRes] = await Promise.all([
      listSentryEventsFn({ data: { projectId: params.projectId } }),
      getSentryIssueFn({
        data: { projectId: params.projectId, issueId: params.issueId },
      }),
    ]);
    const issueEvents = eventsRes.events.filter(
      (e: Event) => e.issueId === params.issueId,
    );
    return { events: issueEvents, issue: issueRes.issue };
  },
});

function IssueDetail() {
  const { projectId } = Route.useParams();
  const { events, issue } = Route.useLoaderData();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventPayload, setEventPayload] = useState<string | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);

  const getEventPayload = useServerFn(getSentryEventPayloadFn);

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
      <div className="page-header mb-6">
        <div>
          <h2>{issue.title}</h2>
          <p className="muted">
            <Link to="/app/issues/$projectId" params={{ projectId }}>
              ← Back to project
            </Link>
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="card-title">Issue Details</div>
        <div style={{ padding: "1rem" }}>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>Status:</strong>{" "}
            <span className="pill small">{issue.status}</span>
          </div>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>Level:</strong>{" "}
            <span className={`status ${issue.level}`}>{issue.level}</span>
          </div>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>Event Count:</strong> {issue.eventCount}
          </div>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>First Seen:</strong> {formatRelativeTime(issue.firstSeenAt)}
          </div>
          <div>
            <strong>Last Seen:</strong> {formatRelativeTime(issue.lastSeenAt)}
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
                    <div style={{ flex: 1 }}>
                      <div className="list-title">
                        {event.message || `${event.type} event`}
                      </div>
                      <div className="muted" style={{ marginTop: "0.25rem" }}>
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
                        <div
                          style={{
                            marginTop: "0.5rem",
                            display: "flex",
                            gap: "0.25rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {Object.entries(event.tags).map(([key, value]) => (
                            <span key={key} className="pill small">
                              {key}: {value}
                            </span>
                          ))}
                        </div>
                      )}
                      {event.contexts && (
                        <div
                          className="muted"
                          style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}
                        >
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
                        <div style={{ marginTop: "0.75rem" }}>
                          <strong style={{ fontSize: "0.875rem" }}>
                            Breadcrumbs:
                          </strong>
                          <div style={{ marginTop: "0.25rem" }}>
                            {event.breadcrumbs.slice(-5).map((crumb, idx) => (
                              <div
                                key={idx}
                                className="muted"
                                style={{
                                  fontSize: "0.875rem",
                                  marginTop: "0.125rem",
                                }}
                              >
                                [{crumb.category}] {crumb.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="outline"
                      onClick={() => handleViewPayload(event.id)}
                      style={{ fontSize: "0.875rem" }}
                    >
                      View Payload
                    </button>
                  </div>
                </div>
                {selectedEventId === event.id && (
                  <div
                    style={{
                      padding: "1rem",
                      backgroundColor: "#f8f9fa",
                      borderTop: "1px solid #dee2e6",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <strong>Event Payload</strong>
                      <button
                        type="button"
                        className="outline"
                        onClick={closePayload}
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.5rem",
                        }}
                      >
                        Close
                      </button>
                    </div>
                    {isLoadingPayload ? (
                      <div>Loading payload...</div>
                    ) : (
                      <pre
                        style={{
                          backgroundColor: "#fff",
                          padding: "1rem",
                          borderRadius: "4px",
                          overflow: "auto",
                          maxHeight: "400px",
                          fontSize: "0.875rem",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
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
