import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import {
  listSentryIssuesFn,
  listSentryEventsFn,
} from "@/server/functions/sentry";

type Issue = {
  id: string;
  title: string;
  level: string;
  status: string;
  eventCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
};

type Event = {
  id: string;
  type: string;
  level: string | null;
  message: string | null;
  receivedAt: number;
};

export const Route = createFileRoute("/app/issues/$projectId/")({
  component: ProjectIssues,
  loader: async ({ params }) => {
    const [issuesRes, eventsRes] = await Promise.all([
      listSentryIssuesFn({ data: { projectId: params.projectId } }),
      listSentryEventsFn({ data: { projectId: params.projectId } }),
    ]);
    return {
      issues: issuesRes.issues,
      events: eventsRes.events,
    };
  },
});

function ProjectIssues() {
  const { projectId } = Route.useParams();
  const { issues: initialIssues, events: initialEvents } =
    Route.useLoaderData();

  const [activeTab, setActiveTab] = useState<"issues" | "events">("issues");
  const [issues] = useState<Issue[]>(initialIssues);
  const [events] = useState<Event[]>(initialEvents);

  return (
    <div className="page">
      <div className="page-header mb-6">
        <div>
          <h2>Project Issues</h2>
          <p className="muted">
            <Link to="/app/issues">← Back to projects</Link>
          </p>
        </div>
      </div>

      <div className="card">
        <div
          className="card-title"
          style={{ display: "flex", alignItems: "center", gap: "1rem" }}
        >
          Issues
          <button
            type="button"
            className="outline"
            onClick={() => setActiveTab("issues")}
            style={{
              marginLeft: "auto",
              fontSize: "0.875rem",
              padding: "0.25rem 0.75rem",
            }}
          >
            Issues ({issues.length})
          </button>
          <button
            type="button"
            className="outline"
            onClick={() => setActiveTab("events")}
            style={{
              fontSize: "0.875rem",
              padding: "0.25rem 0.75rem",
            }}
          >
            Events ({events.length})
          </button>
        </div>
        <div className="list">
          {activeTab === "issues" ? (
            issues.length ? (
              issues.map((issue) => (
                <div key={issue.id} className="list-item-expanded">
                  <div className="list-row">
                    <div style={{ flex: 1 }}>
                      <div className="list-title">
                        {issue.title}
                        <span
                          className="pill small"
                          style={{ marginLeft: "0.5rem" }}
                        >
                          {issue.status}
                        </span>
                      </div>
                      <div className="muted" style={{ marginTop: "0.25rem" }}>
                        <span className={`status ${issue.level}`}>
                          {issue.level}
                        </span>
                        {" · "}
                        {issue.eventCount} event
                        {issue.eventCount !== 1 ? "s" : ""}
                        {" · "}
                        Last seen{" "}
                        {new Date(issue.lastSeenAt * 1000).toLocaleString()}
                      </div>
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="outline"
                        onClick={() =>
                          (window.location.href = `/app/issues/${projectId}/issue/${issue.id}`)
                        }
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">No issues found.</div>
            )
          ) : events.length ? (
            events.map((event) => (
              <div key={event.id} className="list-item">
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
                    {new Date(event.receivedAt * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="muted">No events found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
