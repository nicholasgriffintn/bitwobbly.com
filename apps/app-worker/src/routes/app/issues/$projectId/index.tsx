import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { formatRelativeTime } from "@/utils/time";
import {
  listSentryIssuesFn,
  listSentryEventsFn,
  updateSentryIssueFn,
} from "@/server/functions/sentry";
import {
  getEventVolumeTimeseriesFn,
  getTopErrorMessagesFn,
  getErrorRateByReleaseFn,
} from "@/server/functions/sentry-analytics";

type Issue = {
  id: string;
  title: string;
  level: string;
  status: string;
  eventCount: number;
  userCount: number;
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

  const [activeTab, setActiveTab] = useState<"issues" | "events" | "analytics">(
    "issues",
  );
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [events] = useState<Event[]>(initialEvents);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "count">("recent");

  const updateIssue = useServerFn(updateSentryIssueFn);
  const listIssues = useServerFn(listSentryIssuesFn);
  const getTimeseries = useServerFn(getEventVolumeTimeseriesFn);
  const getTopErrors = useServerFn(getTopErrorMessagesFn);
  const getReleaseStats = useServerFn(getErrorRateByReleaseFn);

  const [timeseriesData, setTimeseriesData] = useState<
    Array<{ timestamp: string; event_count: number }>
  >([]);
  const [topErrors, setTopErrors] = useState<
    Array<{
      message: string;
      event_count: number;
      first_seen: string;
      last_seen: string;
    }>
  >([]);
  const [releaseStats, setReleaseStats] = useState<
    Array<{
      release: string;
      environment: string;
      error_count: number;
      user_count: number;
    }>
  >([]);

  useEffect(() => {
    if (activeTab === "analytics") {
      loadAnalytics();
    }
  }, [activeTab]);

  const loadAnalytics = async () => {
    const endDate = new Date().toISOString();
    const startDate = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    try {
      const [timeseries, errors, releases] = await Promise.all([
        getTimeseries({
          data: {
            projectId: parseInt(projectId),
            startDate,
            endDate,
            interval: "hour",
          },
        }),
        getTopErrors({
          data: { projectId: parseInt(projectId), limit: 10 },
        }),
        getReleaseStats({
          data: { projectId: parseInt(projectId), startDate, endDate },
        }),
      ]);

      setTimeseriesData(timeseries);
      setTopErrors(errors);
      setReleaseStats(releases);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    }
  };

  const handleStatusChange = async (issueId: string, newStatus: string) => {
    try {
      await updateIssue({
        data: { projectId, issueId, status: newStatus },
      });
      const res = await listIssues({ data: { projectId } });
      setIssues(res.issues);
    } catch (err) {
      console.error("Failed to update issue:", err);
    }
  };

  const filteredAndSortedIssues = useMemo(() => {
    let filtered = issues;

    if (searchQuery) {
      filtered = filtered.filter((issue) =>
        issue.title.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((issue) => issue.status === statusFilter);
    }

    if (levelFilter !== "all") {
      filtered = filtered.filter((issue) => issue.level === levelFilter);
    }

    const sorted = [...filtered];
    if (sortBy === "recent") {
      sorted.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    } else if (sortBy === "oldest") {
      sorted.sort((a, b) => a.firstSeenAt - b.firstSeenAt);
    } else if (sortBy === "count") {
      sorted.sort((a, b) => b.eventCount - a.eventCount);
    }

    return sorted;
  }, [issues, searchQuery, statusFilter, levelFilter, sortBy]);

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
        <div className="card-title">
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              type="button"
              className={activeTab === "issues" ? "" : "outline"}
              onClick={() => setActiveTab("issues")}
              style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
            >
              Issues ({filteredAndSortedIssues.length})
            </button>
            <button
              type="button"
              className={activeTab === "events" ? "" : "outline"}
              onClick={() => setActiveTab("events")}
              style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
            >
              Events ({events.length})
            </button>
            <button
              type="button"
              className={activeTab === "analytics" ? "" : "outline"}
              onClick={() => setActiveTab("analytics")}
              style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
            >
              Analytics
            </button>
          </div>

          {activeTab === "issues" && (
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "1rem",
              }}
            >
              <input
                type="text"
                placeholder="Search issues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: "1 1 200px", minWidth: "200px" }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ flex: "0 0 auto" }}
              >
                <option value="all">All Statuses</option>
                <option value="unresolved">Unresolved</option>
                <option value="resolved">Resolved</option>
                <option value="ignored">Ignored</option>
              </select>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                style={{ flex: "0 0 auto" }}
              >
                <option value="all">All Levels</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as "recent" | "oldest" | "count")
                }
                style={{ flex: "0 0 auto" }}
              >
                <option value="recent">Most Recent</option>
                <option value="oldest">Oldest First</option>
                <option value="count">Most Events</option>
              </select>
            </div>
          )}
        </div>
        <div className="list">
          {activeTab === "issues" ? (
            filteredAndSortedIssues.length ? (
              filteredAndSortedIssues.map((issue) => (
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
                        {issue.userCount > 0 && (
                          <>
                            {" · "}
                            {issue.userCount} user
                            {issue.userCount !== 1 ? "s" : ""}
                          </>
                        )}
                        {" · "}
                        Last seen {formatRelativeTime(issue.lastSeenAt)}
                      </div>
                    </div>
                    <div className="button-row">
                      {issue.status === "unresolved" ? (
                        <>
                          <button
                            type="button"
                            className="outline"
                            onClick={() =>
                              handleStatusChange(issue.id, "resolved")
                            }
                            style={{ fontSize: "0.875rem" }}
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            className="outline"
                            onClick={() =>
                              handleStatusChange(issue.id, "ignored")
                            }
                            style={{ fontSize: "0.875rem" }}
                          >
                            Ignore
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="outline"
                          onClick={() =>
                            handleStatusChange(issue.id, "unresolved")
                          }
                          style={{ fontSize: "0.875rem" }}
                        >
                          Reopen
                        </button>
                      )}
                      <Link
                        to="/app/issues/$projectId/issue/$issueId"
                        params={{ projectId, issueId: issue.id }}
                      >
                        <button type="button" className="outline">
                          View
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">
                {searchQuery || statusFilter !== "all" || levelFilter !== "all"
                  ? "No issues match your filters."
                  : "No issues found."}
              </div>
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
                    {formatRelativeTime(event.receivedAt)}
                  </div>
                </div>
              </div>
            ))
          ) : activeTab === "analytics" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
              }}
            >
              <div>
                <h3 style={{ marginBottom: "1rem" }}>
                  Event Volume (Last 7 Days)
                </h3>
                {timeseriesData.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    {timeseriesData.slice(-24).map((point) => (
                      <div
                        key={point.timestamp}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span
                          className="muted"
                          style={{
                            width: "150px",
                            fontSize: "0.875rem",
                            flexShrink: 0,
                          }}
                        >
                          {new Date(point.timestamp).toLocaleString()}
                        </span>
                        <div
                          style={{
                            background: "var(--primary-color)",
                            height: "20px",
                            width: `${Math.min((point.event_count / Math.max(...timeseriesData.map((p) => p.event_count))) * 100, 100)}%`,
                            borderRadius: "2px",
                          }}
                        />
                        <span style={{ fontSize: "0.875rem" }}>
                          {point.event_count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted">Loading chart data...</div>
                )}
              </div>

              <div>
                <h3 style={{ marginBottom: "1rem" }}>Top Error Messages</h3>
                {topErrors.length > 0 ? (
                  <div className="list">
                    {topErrors.map((error, idx) => (
                      <div key={idx} className="list-item">
                        <div style={{ flex: 1 }}>
                          <div className="list-title">{error.message}</div>
                          <div
                            className="muted"
                            style={{ marginTop: "0.25rem" }}
                          >
                            {error.event_count} occurrences · First seen{" "}
                            {formatRelativeTime(
                              Math.floor(
                                new Date(error.first_seen).getTime() / 1000,
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted">Loading error data...</div>
                )}
              </div>

              <div>
                <h3 style={{ marginBottom: "1rem" }}>Error Rate by Release</h3>
                {releaseStats.length > 0 ? (
                  <div className="list">
                    {releaseStats.map((stat, idx) => (
                      <div key={idx} className="list-item">
                        <div style={{ flex: 1 }}>
                          <div className="list-title">
                            {stat.release || "Unknown Release"}
                            {stat.environment && (
                              <span
                                className="pill small"
                                style={{ marginLeft: "0.5rem" }}
                              >
                                {stat.environment}
                              </span>
                            )}
                          </div>
                          <div
                            className="muted"
                            style={{ marginTop: "0.25rem" }}
                          >
                            {stat.error_count} errors · {stat.user_count} users
                            affected
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted">Loading release data...</div>
                )}
              </div>
            </div>
          ) : (
            <div className="muted">No events found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
