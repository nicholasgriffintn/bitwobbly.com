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
  getEventVolumeStatsFn,
  getEventVolumeTimeseriesBreakdownFn,
  getTopErrorMessagesFn,
  getErrorRateByReleaseFn,
  getSDKDistributionFn,
} from "@/server/functions/sentry-analytics";
import { EventMetrics } from "@/components/EventMetrics";
import { EventVolumeChart } from "@/components/EventVolumeChart";
import { SDKDistributionChart } from "@/components/SDKDistributionChart";
import { toTitleCase } from '@/utils/format';

const supportsResolution = (level: string) =>
  level === 'error' || level === 'warning';

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
  const getStats = useServerFn(getEventVolumeStatsFn);
  const getTimeseriesBreakdown = useServerFn(
    getEventVolumeTimeseriesBreakdownFn,
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

  useEffect(() => {
    if (activeTab === 'analytics' && !analyticsLoaded) {
      loadAnalytics();
    }
  }, [activeTab, analyticsLoaded]);

  const loadAnalytics = () => {
    setAnalyticsLoaded(true);

    const endDate = new Date().toISOString();
    const startDate = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    setVolumeStats((s) => ({ ...s, loading: true }));
    getStats({ data: { projectId, startDate, endDate } })
      .then((data) => setVolumeStats({ data, loading: false }))
      .catch(() => setVolumeStats({ data: null, loading: false }));

    setTimeseriesBreakdown((s) => ({ ...s, loading: true }));
    getTimeseriesBreakdown({
      data: { projectId, startDate, endDate, interval: 'hour' },
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
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              type="button"
              className={activeTab === 'issues' ? '' : 'outline'}
              onClick={() => setActiveTab('issues')}
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              Issues ({filteredAndSortedIssues.length})
            </button>
            <button
              type="button"
              className={activeTab === 'events' ? '' : 'outline'}
              onClick={() => setActiveTab('events')}
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              Events ({events.length})
            </button>
            <button
              type="button"
              className={activeTab === 'analytics' ? '' : 'outline'}
              onClick={() => setActiveTab('analytics')}
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              Analytics
            </button>
          </div>

          {activeTab === 'issues' && (
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginBottom: '1rem',
              }}
            >
              <input
                type="text"
                placeholder="Search issues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: '1 1 200px',
                  minWidth: '200px',
                  border: '1px solid var(--stroke)',
                  borderRadius: '8px',
                  padding: '0.5rem 0.75rem',
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ flex: '0 0 auto' }}
              >
                <option value="all">All Statuses</option>
                <option value="unresolved">Unresolved</option>
                <option value="resolved">Resolved</option>
                <option value="ignored">Ignored</option>
              </select>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                style={{ flex: '0 0 auto' }}
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
                  setSortBy(e.target.value as 'recent' | 'oldest' | 'count')
                }
                style={{ flex: '0 0 auto' }}
              >
                <option value="recent">Most Recent</option>
                <option value="oldest">Oldest First</option>
                <option value="count">Most Events</option>
              </select>
            </div>
          )}
        </div>
        <div className="list">
          {activeTab === 'issues' ? (
            filteredAndSortedIssues.length ? (
              filteredAndSortedIssues.map((issue) => (
                <div key={issue.id} className="list-item-expanded">
                  <div className="list-row">
                    <div style={{ flex: 1 }}>
                      <div className="list-title">
                        {issue.title}
                        {supportsResolution(issue.level) && (
                          <span
                            className="pill small"
                            style={{ marginLeft: '0.5rem' }}
                          >
                            {toTitleCase(issue.status)}
                          </span>
                        )}
                      </div>
                      <div className="muted" style={{ marginTop: '0.25rem' }}>
                        <span className={`status ${issue.level}`}>
                          {issue.level}
                        </span>
                        {' · '}
                        {issue.eventCount} event
                        {issue.eventCount !== 1 ? 's' : ''}
                        {issue.userCount > 0 && (
                          <>
                            {' · '}
                            {issue.userCount} user
                            {issue.userCount !== 1 ? 's' : ''}
                          </>
                        )}
                        {' · '}
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
                        (issue.status === 'unresolved' ? (
                          <>
                            <button
                              type="button"
                              className="outline button-success"
                              onClick={() =>
                                handleStatusChange(issue.id, 'resolved')
                              }
                              style={{ fontSize: '0.875rem' }}
                            >
                              Resolve
                            </button>
                            <button
                              type="button"
                              className="outline button-warning"
                              onClick={() =>
                                handleStatusChange(issue.id, 'ignored')
                              }
                              style={{ fontSize: '0.875rem' }}
                            >
                              Ignore
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="outline"
                            onClick={() =>
                              handleStatusChange(issue.id, 'unresolved')
                            }
                            style={{ fontSize: '0.875rem' }}
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
                {searchQuery || statusFilter !== 'all' || levelFilter !== 'all'
                  ? 'No issues match your filters.'
                  : 'No issues found.'}
              </div>
            )
          ) : activeTab === 'events' ? (
            events.length ? (
              events.map((event) => (
                <div key={event.id} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div className="list-title">
                      {event.message || `${event.type} event`}
                    </div>
                    <div className="muted" style={{ marginTop: '0.25rem' }}>
                      {event.level && (
                        <>
                          <span className={`status ${event.level}`}>
                            {event.level}
                          </span>
                          {' · '}
                        </>
                      )}
                      {formatRelativeTime(event.receivedAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">No events found.</div>
            )
          ) : activeTab === 'analytics' ? (
            <div
              style={{
                padding: '1rem',
                background: 'var(--bg)',
                borderRadius: '16px',
                border: '1px solid var(--stroke)',
              }}
            >
              <div>
                {volumeStats.loading ? (
                  <div className="grid metrics mb-1.5">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="card skeleton"
                        style={{ height: '80px' }}
                      />
                    ))}
                  </div>
                ) : volumeStats.data ? (
                  <EventMetrics stats={volumeStats.data} />
                ) : null}

                <div className="card mb-1.5">
                  <div className="card-title">Event Volume (Last 14 Days)</div>
                  {timeseriesBreakdown.loading ? (
                    <div className="skeleton" style={{ height: '400px' }} />
                  ) : timeseriesBreakdown.data.length > 0 ? (
                    <EventVolumeChart data={timeseriesBreakdown.data} />
                  ) : (
                    <div className="muted" style={{ padding: '2rem' }}>
                      No event data available
                    </div>
                  )}
                </div>

                <div className="grid two mb-1.5">
                  <div className="card">
                    <div className="card-title">SDK Distribution</div>
                    {sdkDistribution.loading ? (
                      <div className="skeleton" style={{ height: '200px' }} />
                    ) : sdkDistribution.data.length > 0 ? (
                      <SDKDistributionChart data={sdkDistribution.data} />
                    ) : (
                      <div className="muted" style={{ padding: '2rem' }}>
                        No SDK data available
                      </div>
                    )}
                  </div>

                  <div className="card">
                    <div className="card-title">Top Error Messages</div>
                    {topErrors.loading ? (
                      <div className="list">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="list-item skeleton"
                            style={{ height: '48px' }}
                          />
                        ))}
                      </div>
                    ) : topErrors.data.length > 0 ? (
                      <div className="list">
                        {topErrors.data.slice(0, 5).map((error, idx) => (
                          <div key={idx} className="list-item">
                            <div style={{ flex: 1 }}>
                              <div className="list-title">{error.message}</div>
                              <div
                                className="muted"
                                style={{ marginTop: '0.25rem' }}
                              >
                                {error.event_count} occurrences
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted" style={{ padding: '2rem' }}>
                        No error data available
                      </div>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-title">Error Rate by Release</div>
                  {releaseStats.loading ? (
                    <div className="list">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="list-item skeleton"
                          style={{ height: '48px' }}
                        />
                      ))}
                    </div>
                  ) : releaseStats.data.length > 0 ? (
                    <div className="list">
                      {releaseStats.data.slice(0, 10).map((stat, idx) => (
                        <div key={idx} className="list-item">
                          <div style={{ flex: 1 }}>
                            <div className="list-title">
                              {stat.release || 'Unknown Release'}
                              {stat.environment && (
                                <span
                                  className="pill small"
                                  style={{ marginLeft: '0.5rem' }}
                                >
                                  {toTitleCase(stat.environment)}
                                </span>
                              )}
                            </div>
                            <div
                              className="muted"
                              style={{ marginTop: '0.25rem' }}
                            >
                              {stat.error_count} errors · {stat.user_count}{' '}
                              users affected
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="muted" style={{ padding: '2rem' }}>
                      No release data available
                    </div>
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
