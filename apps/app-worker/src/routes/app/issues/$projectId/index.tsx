import { useState, useMemo, memo, lazy, Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { TIME_CONSTANTS, createLogger } from "@bitwobbly/shared";

import { Card, CardTitle, PageHeader } from "@/components/layout";
import { ListContainer, ListRow } from "@/components/list";
import { TabNav } from "@/components/navigation";
import { Badge, StatusBadge, isStatusType } from "@/components/ui";
import { formatRelativeTime } from "@/utils/time";
import {
  listSentryIssuesFn,
  listSentryEventsFn,
  updateSentryIssueFn,
  listSentryIssueGroupingRulesFn,
} from "@/server/functions/sentry";
import { listTeamMembersFn } from "@/server/functions/teams";
import { toTitleCase } from "@/utils/format";
import type { TeamMember, Issue, Event } from "@/types/issues";
import { supportsResolution } from "@/types/issues";

const logger = createLogger({ service: "app-worker" });

const AnalyticsTab = lazy(() =>
  import("@/components/issues/AnalyticsTab").then((m) => ({
    default: m.AnalyticsTab,
  }))
);

const GroupingTab = lazy(() =>
  import("@/components/issues/GroupingTab").then((m) => ({
    default: m.GroupingTab,
  }))
);

const EventItem = memo(function EventItem({
  event,
  projectId,
}: {
  event: Event;
  projectId: string;
}) {
  return (
    <div className="list-item">
      <div className="flex-1">
        <div className="list-title">
          {event.message || `${event.type} event`}
        </div>
        <div className="muted mt-1">
          {event.level && (
            <>
              <span className={`status ${event.level}`}>{event.level}</span>
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
  );
});

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

function TabLoadingFallback() {
  return (
    <div className="p-8">
      <div className="skeleton h-48 w-full" />
    </div>
  );
}

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

  const memberEmailById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.userId, member.email);
    }
    return map;
  }, [members]);

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
          ignoredUntil:
            newStatus === "ignored"
              ? now + TIME_CONSTANTS.ONE_WEEK_SECONDS
              : null,
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
      logger.error("Failed to update issue:", { err });
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
                count: initialGroupingRules.length,
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

            <input
              type="text"
              placeholder="Search issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--stroke)] bg-white px-3 py-2"
            />

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
                <EventItem key={event.id} event={event} projectId={projectId} />
              ))
            ) : (
              <div className="muted">No events found.</div>
            )
          ) : activeTab === "analytics" ? (
            <Suspense fallback={<TabLoadingFallback />}>
              <AnalyticsTab projectId={projectId} />
            </Suspense>
          ) : activeTab === "grouping" ? (
            <Suspense fallback={<TabLoadingFallback />}>
              <GroupingTab
                projectId={projectId}
                initialRules={initialGroupingRules}
              />
            </Suspense>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
