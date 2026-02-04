import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/layout";
import { TabNav } from "@/components/navigation";
import { formatRelativeTime } from "@/utils/time";
import {
  listSentryIssuesFn,
  listSentryEventsFn,
  updateSentryIssueFn,
} from "@/server/functions/sentry";
import {
  getEventVolumeStatsFn,
  getEventVolumeTimeseriesBreakdownFn,
  getTopErrorMessagesFn,
  getErrorRateByReleaseFn,
  getSDKDistributionFn,
} from "@/server/functions/sentry-analytics";
import { EventMetrics } from "@/components/EventMetrics";
import { EventVolumeChart } from "@/components/EventVolumeChart";
import { SDKDistributionChart } from "@/components/SDKDistributionChart";
import { toTitleCase } from "@/utils/format";

const supportsResolution = (level: string) =>
  level === "error" || level === "warning";

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
  issueId: string | null;
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
    "issues"
  );
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [events] = useState<Event[]>(initialEvents);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "count">("recent");

  const updateIssue = useServerFn(updateSentryIssueFn);
  const listIssues = useServerFn(listSentryIssuesFn);
  const getStats = useServerFn(getEventVolumeStatsFn);
  const getTimeseriesBreakdown = useServerFn(
    getEventVolumeTimeseriesBreakdownFn
  );
  const getTopErrors = useServerFn(getTopErrorMessagesFn);
  const getReleaseStats = useServerFn(getErrorRateByReleaseFn);
  const getSDKDist = useServerFn(getSDKDistributionFn);

  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  const [volumeStats, setVolumeStats] = useState<{
    data: {
      total_events: number;
      accepted_events: number;
      filtered_events: number;
      dropped_events: number;
    } | null;
    loading: boolean;
  }>({ data: null, loading: false });
  const [timeseriesBreakdown, setTimeseriesBreakdown] = useState<{
    data: Array<{
      timestamp: string;
      accepted: number;
      filtered: number;
      dropped: number;
    }>;
    loading: boolean;
  }>({ data: [], loading: false });
  const [sdkDistribution, setSdkDistribution] = useState<{
    data: Array<{ sdk_name: string; event_count: number; percentage: number }>;
    loading: boolean;
  }>({ data: [], loading: false });
  const [topErrors, setTopErrors] = useState<{
    data: Array<{
      message: string;
      event_count: number;
      first_seen: string;
      last_seen: string;
    }>;
    loading: boolean;
  }>({ data: [], loading: false });
  const [releaseStats, setReleaseStats] = useState<{
    data: Array<{
      release: string;
      environment: string;
      error_count: number;
      user_count: number;
    }>;
    loading: boolean;
  }>({ data: [], loading: false });

  const loadAnalytics = () => {
    setAnalyticsLoaded(true);

    const endDate = new Date().toISOString();
    const startDate = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();

    setVolumeStats((s) => ({ ...s, loading: true }));
    getStats({ data: { projectId, startDate, endDate } })
      .then((data) => setVolumeStats({ data, loading: false }))
      .catch(() => setVolumeStats({ data: null, loading: false }));

    setTimeseriesBreakdown((s) => ({ ...s, loading: true }));
    getTimeseriesBreakdown({
      data: { projectId, startDate, endDate, interval: "hour" },
    })
      .then((data) => setTimeseriesBreakdown({ data, loading: false }))
      .catch(() => setTimeseriesBreakdown({ data: [], loading: false }));

    setSdkDistribution((s) => ({ ...s, loading: true }));
    getSDKDist({ data: { projectId, startDate, endDate } })
      .then((data) => setSdkDistribution({ data, loading: false }))
      .catch(() => setSdkDistribution({ data: [], loading: false }));

    setTopErrors((s) => ({ ...s, loading: true }));
    getTopErrors({ data: { projectId, limit: 10 } })
      .then((data) => setTopErrors({ data, loading: false }))
      .catch(() => setTopErrors({ data: [], loading: false }));

    setReleaseStats((s) => ({ ...s, loading: true }));
    getReleaseStats({ data: { projectId, startDate, endDate } })
      .then((data) => setReleaseStats({ data, loading: false }))
      .catch(() => setReleaseStats({ data: [], loading: false }));
  };

  useEffect(() => {
    if (activeTab === "analytics" && !analyticsLoaded) {
      loadAnalytics();
    }
  }, [activeTab, analyticsLoaded]);

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
        issue.title.toLowerCase().includes(searchQuery.toLowerCase())
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

  const issueStatusCounts = useMemo(() => {
    return issues.reduce(
      (acc, issue) => {
        if (issue.status === "unresolved") acc.unresolved += 1;
        else if (issue.status === "resolved") acc.resolved += 1;
        else if (issue.status === "ignored") acc.ignored += 1;
        return acc;
      },
      { unresolved: 0, resolved: 0, ignored: 0 }
    );
  }, [issues]);

  return (
    <div className="page">
      <PageHeader
        title="Project Issues"
        description={<Link to="/app/issues">← Back to projects</Link>}
        className="mb-6"
      />

      <div className="card">
        <div className="card-title">
          <TabNav
            tabs={[
              {
                id: "issues",
                label: "Issues",
                count: filteredAndSortedIssues.length,
              },
              { id: "events", label: "Events", count: events.length },
              { id: "analytics", label: "Analytics" },
            ]}
            activeTab={activeTab}
            onTabChange={(tabId) =>
              setActiveTab(tabId as "issues" | "events" | "analytics")
            }
          />

          {activeTab === "issues" && (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="pill small">
                  Open: {issueStatusCounts.unresolved}
                </span>
                <span className="pill small">
                  Resolved: {issueStatusCounts.resolved}
                </span>
                <span className="pill small">
                  Ignored: {issueStatusCounts.ignored}
                </span>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-lg border border-[color:var(--stroke)] bg-white px-3 py-2"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="flex-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="unresolved">Unresolved</option>
                  <option value="resolved">Resolved</option>
                  <option value="ignored">Ignored</option>
                </select>
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className="flex-none"
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
                  className="flex-none"
                >
                  <option value="recent">Most Recent</option>
                  <option value="oldest">Oldest First</option>
                  <option value="count">Most Events</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="list">
          {activeTab === "issues" ? (
            filteredAndSortedIssues.length ? (
              filteredAndSortedIssues.map((issue) => (
                <div key={issue.id} className="list-item-expanded">
                  <div className="list-row">
                    <div className="flex-1">
                      <div className="list-title">
                        {issue.title}
                        {supportsResolution(issue.level) && (
                          <span className="pill small ml-2">
                            {toTitleCase(issue.status)}
                          </span>
                        )}
                      </div>
                      <div className="muted mt-1">
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
                      <Link
                        to="/app/issues/$projectId/issue/$issueId"
                        params={{ projectId, issueId: issue.id }}
                      >
                        <button type="button" className="outline">
                          View
                        </button>
                      </Link>
                      {supportsResolution(issue.level) &&
                        (issue.status === "unresolved" ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                handleStatusChange(issue.id, "resolved")
                              }
                              className="outline button-success text-sm"
                            >
                              Resolve
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleStatusChange(issue.id, "ignored")
                              }
                              className="outline button-warning text-sm"
                            >
                              Ignore
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusChange(issue.id, "unresolved")
                            }
                            className="outline text-sm"
                          >
                            Reopen
                          </button>
                        ))}
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
          ) : activeTab === "events" ? (
            events.length ? (
              events.map((event) => (
                <div key={event.id} className="list-item">
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
                    </div>
                  </div>
                  {event.issueId && (
                    <Link
                      to="/app/issues/$projectId/issue/$issueId"
                      params={{ projectId, issueId: event.issueId }}
                    >
                      <button type="button" className="outline">
                        Open issue
                      </button>
                    </Link>
                  )}
                </div>
              ))
            ) : (
              <div className="muted">No events found.</div>
            )
          ) : activeTab === "analytics" ? (
            <div className="rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--bg)] p-4">
              <div>
                {volumeStats.loading ? (
                  <div className="grid metrics mb-1.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="card skeleton h-20" />
                    ))}
                  </div>
                ) : volumeStats.data ? (
                  <EventMetrics stats={volumeStats.data} />
                ) : null}

                <div className="card mb-1.5">
                  <div className="card-title">Event Volume (Last 14 Days)</div>
                  {timeseriesBreakdown.loading ? (
                    <div className="skeleton h-[400px]" />
                  ) : timeseriesBreakdown.data.length > 0 ? (
                    <EventVolumeChart data={timeseriesBreakdown.data} />
                  ) : (
                    <div className="muted p-8">No event data available</div>
                  )}
                </div>

                <div className="grid two mb-1.5">
                  <div className="card">
                    <div className="card-title">SDK Distribution</div>
                    {sdkDistribution.loading ? (
                      <div className="skeleton h-[200px]" />
                    ) : sdkDistribution.data.length > 0 ? (
                      <SDKDistributionChart data={sdkDistribution.data} />
                    ) : (
                      <div className="muted p-8">No SDK data available</div>
                    )}
                  </div>

                  <div className="card">
                    <div className="card-title">Top Error Messages</div>
                    {topErrors.loading ? (
                      <div className="list">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="list-item skeleton h-12" />
                        ))}
                      </div>
                    ) : topErrors.data.length > 0 ? (
                      <div className="list">
                        {topErrors.data.slice(0, 5).map((error, idx) => (
                          <div key={idx} className="list-item">
                            <div className="flex-1">
                              <div className="list-title">{error.message}</div>
                              <div className="muted mt-1">
                                {error.event_count} occurrences
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted p-8">No error data available</div>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-title">Error Rate by Release</div>
                  {releaseStats.loading ? (
                    <div className="list">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="list-item skeleton h-12" />
                      ))}
                    </div>
                  ) : releaseStats.data.length > 0 ? (
                    <div className="list">
                      {releaseStats.data.slice(0, 10).map((stat, idx) => (
                        <div key={idx} className="list-item">
                          <div className="flex-1">
                            <div className="list-title">
                              {stat.release || "Unknown Release"}
                              {stat.environment && (
                                <span className="pill small ml-2">
                                  {toTitleCase(stat.environment)}
                                </span>
                              )}
                            </div>
                            <div className="muted mt-1">
                              {stat.error_count} errors · {stat.user_count}{" "}
                              users affected
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted p-8">No release data available</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
