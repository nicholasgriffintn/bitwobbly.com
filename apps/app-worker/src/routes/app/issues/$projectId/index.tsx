import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardTitle, PageHeader } from "@/components/layout";
import { ListContainer, ListRow } from "@/components/list";
import { TabNav } from "@/components/navigation";
import { Badge, StatusBadge, isStatusType } from "@/components/ui";
import { formatRelativeTime } from "@/utils/time";
import {
  listSentryIssuesFn,
  listSentryEventsFn,
  updateSentryIssueFn,
  deleteSentryIssueGroupingRuleFn,
  listSentryIssueGroupingRulesFn,
  updateSentryIssueGroupingRuleFn,
  getSentryReleaseHealthFn,
  listSentryClientReportsFn,
} from "@/server/functions/sentry";
import { listTeamMembersFn } from "@/server/functions/teams";
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
import { GroupingRuleModal } from "@/components/modals/issues";
import { toTitleCase } from "@/utils/format";

const supportsResolution = (level: string) =>
  level === "error" || level === "warning";

type TeamMember = {
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
};

type Issue = {
  id: string;
  title: string;
  level: string;
  status: string;
  culprit: string | null;
  assignedToUserId: string | null;
  assignedAt: number | null;
  snoozedUntil: number | null;
  ignoredUntil: number | null;
  resolvedInRelease: string | null;
  regressedAt: number | null;
  regressedCount: number;
  eventCount: number;
  userCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastSeenRelease: string | null;
  lastSeenEnvironment: string | null;
};

type Event = {
  id: string;
  type: string;
  level: string | null;
  message: string | null;
  receivedAt: number;
  issueId: string | null;
};

type IssueGroupingRule = {
  id: string;
  name: string;
  enabled: number;
  matchers: {
    exceptionType?: string;
    level?: string;
    messageIncludes?: string;
    culpritIncludes?: string;
    transactionIncludes?: string;
  } | null;
  fingerprint: string;
  createdAt: string;
};

export const Route = createFileRoute("/app/issues/$projectId/")({
  component: ProjectIssues,
  loader: async ({ params }) => {
    const [issuesRes, eventsRes, membersRes, groupingRulesRes] =
      await Promise.all([
        listSentryIssuesFn({ data: { projectId: params.projectId } }),
        listSentryEventsFn({ data: { projectId: params.projectId } }),
        listTeamMembersFn(),
        listSentryIssueGroupingRulesFn({
          data: { projectId: params.projectId },
        }),
      ]);
    return {
      issues: issuesRes.issues,
      events: eventsRes.events,
      members: membersRes.members,
      groupingRules: groupingRulesRes.rules,
    };
  },
});

function ProjectIssues() {
  const { projectId } = Route.useParams();
  const {
    issues: initialIssues,
    events: initialEvents,
    members: initialMembers,
    groupingRules: initialGroupingRules,
  } = Route.useLoaderData();

  const [activeTab, setActiveTab] = useState<
    "issues" | "events" | "analytics" | "grouping"
  >("issues");
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [events] = useState<Event[]>(initialEvents);
  const [members] = useState<TeamMember[]>(initialMembers);
  const [groupingRules, setGroupingRules] =
    useState<IssueGroupingRule[]>(initialGroupingRules);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [releaseFilter, setReleaseFilter] = useState<string>("all");
  const [environmentFilter, setEnvironmentFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [includeSnoozed, setIncludeSnoozed] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "count">("recent");
  const [isRefreshingIssues, setIsRefreshingIssues] = useState(false);

  const updateIssue = useServerFn(updateSentryIssueFn);
  const listIssues = useServerFn(listSentryIssuesFn);
  const getStats = useServerFn(getEventVolumeStatsFn);
  const getTimeseriesBreakdown = useServerFn(
    getEventVolumeTimeseriesBreakdownFn
  );
  const getTopErrors = useServerFn(getTopErrorMessagesFn);
  const getReleaseStats = useServerFn(getErrorRateByReleaseFn);
  const getSDKDist = useServerFn(getSDKDistributionFn);
  const listGroupingRules = useServerFn(listSentryIssueGroupingRulesFn);
  const updateGroupingRule = useServerFn(updateSentryIssueGroupingRuleFn);
  const deleteGroupingRule = useServerFn(deleteSentryIssueGroupingRuleFn);
  const getReleaseHealth = useServerFn(getSentryReleaseHealthFn);
  const listClientReports = useServerFn(listSentryClientReportsFn);

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
  const [releaseHealth, setReleaseHealth] = useState<{
    data: Array<{
      release: string | null;
      environment: string | null;
      total_sessions: number;
      crashed_sessions: number;
      errored_sessions: number;
      crash_free_rate: number;
    }>;
    loading: boolean;
  }>({ data: [], loading: false });
  const [clientReports, setClientReports] = useState<{
    data: Array<{
      id: string;
      timestamp: number;
      discardedEvents: Array<{
        reason: string;
        category: string;
        quantity: number;
      }> | null;
    }>;
    loading: boolean;
  }>({ data: [], loading: false });

  const memberEmailById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.userId, member.email);
    }
    return map;
  }, [members]);

  const [isGroupingRuleModalOpen, setIsGroupingRuleModalOpen] = useState(false);
  const [editingGroupingRule, setEditingGroupingRule] =
    useState<IssueGroupingRule | null>(null);

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

    const since = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
    const until = Math.floor(Date.now() / 1000);

    setReleaseHealth((s) => ({ ...s, loading: true }));
    getReleaseHealth({ data: { projectId, since, until } })
      .then((res) => setReleaseHealth({ data: res.health, loading: false }))
      .catch(() => setReleaseHealth({ data: [], loading: false }));

    setClientReports((s) => ({ ...s, loading: true }));
    listClientReports({ data: { projectId, since, until, limit: 50 } })
      .then((res) => setClientReports({ data: res.reports, loading: false }))
      .catch(() => setClientReports({ data: [], loading: false }));
  };

  useEffect(() => {
    if (activeTab === "analytics" && !analyticsLoaded) {
      loadAnalytics();
    }
  }, [activeTab, analyticsLoaded]);

  const refreshIssues = async () => {
    setIsRefreshingIssues(true);
    try {
      const res = await listIssues({
        data: {
          projectId,
          status: statusFilter === "all" ? undefined : statusFilter,
          query: searchQuery || undefined,
          release: releaseFilter === "all" ? undefined : releaseFilter,
          environment:
            environmentFilter === "all" ? undefined : environmentFilter,
          assignedToUserId:
            assigneeFilter === "all" || assigneeFilter === "unassigned"
              ? undefined
              : assigneeFilter,
          unassigned: assigneeFilter === "unassigned" ? true : undefined,
          includeSnoozed,
        },
      });
      setIssues(res.issues);
    } finally {
      setIsRefreshingIssues(false);
    }
  };

  const handleStatusChange = async (issueId: string, newStatus: string) => {
    try {
      const issue = issues.find((i) => i.id === issueId);
      const now = Math.floor(Date.now() / 1000);
      await updateIssue({
        data: {
          projectId,
          issueId,
          status: newStatus,
          ignoredUntil: newStatus === "ignored" ? now + 7 * 24 * 60 * 60 : null,
          resolvedInRelease:
            newStatus === "resolved"
              ? (issue?.lastSeenRelease ?? null)
              : newStatus === "unresolved"
                ? null
                : undefined,
        },
      });
      await refreshIssues();
    } catch (err) {
      console.error("Failed to update issue:", err);
    }
  };

  const filteredAndSortedIssues = useMemo(() => {
    let filtered = issues;

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
  }, [issues, levelFilter, sortBy]);

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

  const releaseOptions = useMemo(() => {
    const set = new Set<string>();
    for (const issue of issues) {
      if (issue.lastSeenRelease) set.add(issue.lastSeenRelease);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const environmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const issue of issues) {
      if (issue.lastSeenEnvironment) set.add(issue.lastSeenEnvironment);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const refreshGroupingRules = async () => {
    const res = await listGroupingRules({ data: { projectId } });
    setGroupingRules(res.rules);
  };

  const openCreateGroupingRule = () => {
    setEditingGroupingRule(null);
    setIsGroupingRuleModalOpen(true);
  };

  const openEditGroupingRule = (rule: IssueGroupingRule) => {
    setEditingGroupingRule(rule);
    setIsGroupingRuleModalOpen(true);
  };

  const closeGroupingRuleModal = () => {
    setIsGroupingRuleModalOpen(false);
    setEditingGroupingRule(null);
  };

  const handleToggleGroupingRule = async (ruleId: string, enabled: boolean) => {
    await updateGroupingRule({ data: { projectId, ruleId, enabled } });
    await refreshGroupingRules();
  };

  const handleDeleteGroupingRule = async (ruleId: string) => {
    if (!confirm("Delete this grouping rule?")) return;
    await deleteGroupingRule({ data: { projectId, ruleId } });
    await refreshGroupingRules();
  };

  return (
    <div className="page">
      <PageHeader
        title="Project Issues"
        description={<Link to="/app/issues">← Back to projects</Link>}
        className="mb-6"
      />

      <Card>
        <CardTitle>
          <TabNav
            tabs={[
              {
                id: "issues",
                label: "Issues",
                count: filteredAndSortedIssues.length,
              },
              { id: "events", label: "Events", count: events.length },
              { id: "analytics", label: "Analytics" },
              {
                id: "grouping",
                label: "Grouping",
                count: groupingRules.length,
              },
            ]}
            activeTab={activeTab}
            onTabChange={(tabId) =>
              setActiveTab(
                tabId as "issues" | "events" | "analytics" | "grouping"
              )
            }
          />
        </CardTitle>

        {activeTab === "issues" && (
          <div className="mb-4 space-y-3 border-b border-[color:var(--stroke)] pb-4">
            {/* Status summary */}
            <div className="flex flex-wrap gap-2">
              <Badge
                size="small"
                variant={statusFilter === "unresolved" ? "danger" : "default"}
              >
                Open: {issueStatusCounts.unresolved}
              </Badge>
              <Badge
                size="small"
                variant={statusFilter === "resolved" ? "success" : "default"}
              >
                Resolved: {issueStatusCounts.resolved}
              </Badge>
              <Badge
                size="small"
                variant={statusFilter === "ignored" ? "muted" : "default"}
              >
                Ignored: {issueStatusCounts.ignored}
              </Badge>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--stroke)] bg-white px-3 py-2"
            />

            {/* Primary filters */}
            <div className="flex flex-wrap gap-2">
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

            {/* Secondary filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={releaseFilter}
                onChange={(e) => setReleaseFilter(e.target.value)}
                className="flex-none"
              >
                <option value="all">All Releases</option>
                {releaseOptions.map((release) => (
                  <option key={release} value={release}>
                    {release}
                  </option>
                ))}
              </select>
              <select
                value={environmentFilter}
                onChange={(e) => setEnvironmentFilter(e.target.value)}
                className="flex-none"
              >
                <option value="all">All Environments</option>
                {environmentOptions.map((env) => (
                  <option key={env} value={env}>
                    {toTitleCase(env)}
                  </option>
                ))}
              </select>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="flex-none"
              >
                <option value="all">All Assignees</option>
                <option value="unassigned">Unassigned</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.email}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={includeSnoozed}
                  onChange={(e) => setIncludeSnoozed(e.target.checked)}
                />
                Include snoozed
              </label>
              <button
                type="button"
                className="outline"
                onClick={() => refreshIssues()}
                disabled={isRefreshingIssues}
              >
                {isRefreshingIssues ? "Refreshing..." : "Apply"}
              </button>
            </div>
          </div>
        )}
        <div className="list">
          {activeTab === "issues" ? (
            <ListContainer
              isEmpty={!filteredAndSortedIssues.length}
              emptyMessage={
                searchQuery ||
                statusFilter !== "all" ||
                levelFilter !== "all" ||
                releaseFilter !== "all" ||
                environmentFilter !== "all" ||
                assigneeFilter !== "all"
                  ? "No issues match your filters."
                  : "No issues found."
              }
            >
              {filteredAndSortedIssues.map((issue) => (
                <ListRow
                  key={issue.id}
                  className="list-item-expanded"
                  title={issue.title}
                  badges={
                    <>
                      {supportsResolution(issue.level) && (
                        <Badge
                          size="small"
                          variant={
                            issue.status === "resolved"
                              ? "success"
                              : issue.status === "ignored"
                                ? "muted"
                                : "danger"
                          }
                        >
                          {toTitleCase(issue.status)}
                        </Badge>
                      )}
                      {issue.assignedToUserId && (
                        <Badge size="small" variant="info">
                          {memberEmailById.get(issue.assignedToUserId) ??
                            "Assigned"}
                        </Badge>
                      )}
                      {issue.regressedCount > 0 && (
                        <Badge size="small" variant="warning">
                          Regressed ×{issue.regressedCount}
                        </Badge>
                      )}
                    </>
                  }
                  subtitle={
                    <>
                      {isStatusType(issue.level) ? (
                        <StatusBadge status={issue.level}>
                          {issue.level}
                        </StatusBadge>
                      ) : (
                        <span className={`status ${issue.level}`}>
                          {issue.level}
                        </span>
                      )}
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
                      {issue.snoozedUntil &&
                      issue.snoozedUntil > Math.floor(Date.now() / 1000) ? (
                        <>
                          {" · "}
                          <Badge size="small" variant="muted">
                            Snoozed until{" "}
                            {formatRelativeTime(issue.snoozedUntil)}
                          </Badge>
                        </>
                      ) : null}
                    </>
                  }
                  subtitleClassName="muted mt-1 flex flex-wrap items-center gap-1"
                  actions={
                    <>
                      <Link
                        to="/app/issues/$projectId/issue/$issueId"
                        params={{ projectId, issueId: issue.id }}
                      >
                        <button type="button" className="outline">
                          View
                        </button>
                      </Link>
                      {supportsResolution(issue.level) &&
                        issue.status === "unresolved" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusChange(issue.id, "resolved")
                            }
                            className="outline button-success text-sm"
                          >
                            Resolve
                          </button>
                        )}
                      {supportsResolution(issue.level) &&
                        issue.status !== "unresolved" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusChange(issue.id, "unresolved")
                            }
                            className="outline text-sm"
                          >
                            Reopen
                          </button>
                        )}
                    </>
                  }
                />
              ))}
            </ListContainer>
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

                <div className="grid two mt-1.5">
                  <div className="card">
                    <div className="card-title">
                      Release Health (Crash-free Sessions)
                    </div>
                    {releaseHealth.loading ? (
                      <div className="list">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="list-item skeleton h-12" />
                        ))}
                      </div>
                    ) : releaseHealth.data.length > 0 ? (
                      <div className="list">
                        {releaseHealth.data.slice(0, 10).map((row, idx) => (
                          <div key={idx} className="list-item">
                            <div className="flex-1">
                              <div className="list-title">
                                {row.release || "Unknown Release"}
                                {row.environment ? (
                                  <span className="pill small ml-2">
                                    {toTitleCase(row.environment)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="muted mt-1">
                                {(row.crash_free_rate * 100).toFixed(2)}%
                                crash-free · {row.total_sessions} sessions ·{" "}
                                {row.crashed_sessions} crashed
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted p-8">No session data available</div>
                    )}
                  </div>

                  <div className="card">
                    <div className="card-title">Client Reports</div>
                    {clientReports.loading ? (
                      <div className="list">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="list-item skeleton h-12" />
                        ))}
                      </div>
                    ) : clientReports.data.length > 0 ? (
                      <div className="list">
                        {clientReports.data.slice(0, 10).map((report) => (
                          <div key={report.id} className="list-item">
                            <div className="flex-1">
                              <div className="list-title">
                                {formatRelativeTime(report.timestamp)}
                              </div>
                              <div className="muted mt-1">
                                {report.discardedEvents?.length
                                  ? report.discardedEvents
                                      .slice(0, 3)
                                      .map(
                                        (e) =>
                                          `${e.category}:${e.reason} (${e.quantity})`
                                      )
                                      .join(", ")
                                  : "No discarded event details"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted p-8">
                        No client report data available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "grouping" ? (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Grouping Rules</div>
                  <div className="muted">
                    Override grouping per project without deploying code.
                  </div>
                </div>
                <button
                  type="button"
                  className="outline"
                  onClick={openCreateGroupingRule}
                >
                  New rule
                </button>
              </div>
              <div className="list">
                {groupingRules.length ? (
                  groupingRules.map((rule) => (
                    <div key={rule.id} className="list-item-expanded">
                      <div className="list-row">
                        <div className="flex-1">
                          <div className="list-title">
                            {rule.name}
                            <span className="pill small ml-2">
                              {rule.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <div className="muted mt-1">
                            Fingerprint: <code>{rule.fingerprint}</code>
                            {rule.matchers ? (
                              <>
                                {" · "}
                                Matchers:{" "}
                                <code>{JSON.stringify(rule.matchers)}</code>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="button-row">
                          <button
                            type="button"
                            className="outline"
                            onClick={() =>
                              handleToggleGroupingRule(
                                rule.id,
                                !(rule.enabled === 1)
                              )
                            }
                          >
                            {rule.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            className="outline"
                            onClick={() => openEditGroupingRule(rule)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="outline button-danger"
                            onClick={() => handleDeleteGroupingRule(rule.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted">No grouping rules yet.</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <GroupingRuleModal
        isOpen={isGroupingRuleModalOpen}
        onClose={closeGroupingRuleModal}
        onSuccess={refreshGroupingRules}
        projectId={projectId}
        rule={editingGroupingRule}
      />
    </div>
  );
}
