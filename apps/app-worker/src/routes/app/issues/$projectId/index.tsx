import {
  useMemo,
  memo,
  lazy,
  Suspense,
  useReducer,
  useEffect,
  useState,
} from "react";
import { Await, createFileRoute, defer, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  TIME_CONSTANTS,
  createLogger,
  serialiseError,
} from "@bitwobbly/shared";

import { Card, CardTitle, PageHeader } from "@/components/layout";
import { ListContainer, ListRow } from "@/components/list";
import { TabNav } from "@/components/navigation";
import { Badge, StatusBadge, isStatusType } from "@/components/ui";
import { formatRelativeTime } from "@/utils/time";
import {
  listSentryIssuesFn,
  updateSentryIssueFn,
  getSentryProjectSecondaryDataFn,
} from "@/server/functions/sentry";
import { listTeamMembersFn } from "@/server/functions/teams";
import { toTitleCase } from "@/utils/format";
import type {
  Issue,
  Event,
  TeamMember,
  IssueGroupingRule,
} from "@/types/issues";
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

type TabId = "issues" | "events" | "analytics" | "grouping";

type IssuesState = {
  activeTab: TabId;
  issues: Issue[];
  searchQuery: string;
  statusFilter: string;
  levelFilter: string;
  releaseFilter: string;
  environmentFilter: string;
  assigneeFilter: string;
  includeSnoozed: boolean;
  sortBy: "recent" | "oldest" | "count";
  isRefreshingIssues: boolean;
};

type IssuesAction =
  | { type: "setActiveTab"; value: TabId }
  | { type: "setIssues"; value: Issue[] }
  | { type: "setSearchQuery"; value: string }
  | { type: "setStatusFilter"; value: string }
  | { type: "setLevelFilter"; value: string }
  | { type: "setReleaseFilter"; value: string }
  | { type: "setEnvironmentFilter"; value: string }
  | { type: "setAssigneeFilter"; value: string }
  | { type: "setIncludeSnoozed"; value: boolean }
  | { type: "setSortBy"; value: "recent" | "oldest" | "count" }
  | { type: "setIsRefreshingIssues"; value: boolean };

function issuesReducer(state: IssuesState, action: IssuesAction): IssuesState {
  switch (action.type) {
    case "setActiveTab":
      return { ...state, activeTab: action.value };
    case "setIssues":
      return { ...state, issues: action.value };
    case "setSearchQuery":
      return { ...state, searchQuery: action.value };
    case "setStatusFilter":
      return { ...state, statusFilter: action.value };
    case "setLevelFilter":
      return { ...state, levelFilter: action.value };
    case "setReleaseFilter":
      return { ...state, releaseFilter: action.value };
    case "setEnvironmentFilter":
      return { ...state, environmentFilter: action.value };
    case "setAssigneeFilter":
      return { ...state, assigneeFilter: action.value };
    case "setIncludeSnoozed":
      return { ...state, includeSnoozed: action.value };
    case "setSortBy":
      return { ...state, sortBy: action.value };
    case "setIsRefreshingIssues":
      return { ...state, isRefreshingIssues: action.value };
    default:
      return state;
  }
}

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

function ProjectIssuesPending() {
  return (
    <div className="page">
      <div className="skeleton h-10 w-56 mb-6" />
      <div className="card">
        <div className="skeleton h-10 w-full mb-4" />
        <div className="mb-4 space-y-3 pb-4">
          <div className="skeleton h-8 w-full" />
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-9 w-32" />
            ))}
          </div>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-16 w-full mb-2" />
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/app/issues/$projectId/")({
  component: ProjectIssues,
  pendingComponent: ProjectIssuesPending,
  pendingMs: 150,
  staleTime: 15_000,
  loader: async ({ params }) => {
    const issuesPromise = listSentryIssuesFn({
      data: { projectId: params.projectId },
    });
    const membersPromise = listTeamMembersFn().then((r) => r.members);

    const issuesRes = await issuesPromise;
    return {
      issues: issuesRes.issues,
      membersPromise: defer(membersPromise),
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

function MembersHydrator({
  members,
  onLoaded,
}: {
  members: TeamMember[];
  onLoaded: (members: TeamMember[]) => void;
}) {
  useEffect(() => {
    onLoaded(members);
  }, [members, onLoaded]);
  return null;
}

function ProjectIssues() {
  const { projectId } = Route.useParams();
  const { issues: initialIssues, membersPromise } = Route.useLoaderData();

  const [state, dispatch] = useReducer(issuesReducer, {
    activeTab: "issues",
    issues: initialIssues,
    searchQuery: "",
    statusFilter: "all",
    levelFilter: "all",
    releaseFilter: "all",
    environmentFilter: "all",
    assigneeFilter: "all",
    includeSnoozed: false,
    sortBy: "recent",
    isRefreshingIssues: false,
  });
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [secondaryData, setSecondaryData] = useState<{
    events: Event[];
    rules: IssueGroupingRule[];
  } | null>(null);
  const [isSecondaryDataLoading, setIsSecondaryDataLoading] = useState(false);
  const [secondaryDataError, setSecondaryDataError] = useState<string | null>(
    null
  );

  const updateIssue = useServerFn(updateSentryIssueFn);
  const listIssues = useServerFn(listSentryIssuesFn);
  const getProjectSecondaryData = useServerFn(getSentryProjectSecondaryDataFn);

  useEffect(() => {
    if (
      state.activeTab !== "events" &&
      state.activeTab !== "grouping"
    ) {
      return;
    }
    if (secondaryData || isSecondaryDataLoading) {
      return;
    }

    let cancelled = false;
    setSecondaryDataError(null);
    setIsSecondaryDataLoading(true);
    void getProjectSecondaryData({
      data: { projectId, eventsLimit: 100 },
    })
      .then((res) => {
        if (cancelled) return;
        setSecondaryData({ events: res.events, rules: res.rules });
      })
      .catch((err) => {
        if (cancelled) return;
        setSecondaryDataError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setIsSecondaryDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    getProjectSecondaryData,
    isSecondaryDataLoading,
    projectId,
    secondaryData,
    state.activeTab,
  ]);

  const memberEmailById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.userId, member.email);
    }
    return map;
  }, [members]);

  const refreshIssues = async () => {
    dispatch({ type: "setIsRefreshingIssues", value: true });
    try {
      const res = await listIssues({
        data: {
          projectId,
          status: state.statusFilter === "all" ? undefined : state.statusFilter,
          query: state.searchQuery || undefined,
          release:
            state.releaseFilter === "all" ? undefined : state.releaseFilter,
          environment:
            state.environmentFilter === "all"
              ? undefined
              : state.environmentFilter,
          assignedToUserId:
            state.assigneeFilter === "all" ||
            state.assigneeFilter === "unassigned"
              ? undefined
              : state.assigneeFilter,
          unassigned: state.assigneeFilter === "unassigned" ? true : undefined,
          includeSnoozed: state.includeSnoozed,
        },
      });
      dispatch({ type: "setIssues", value: res.issues });
    } finally {
      dispatch({ type: "setIsRefreshingIssues", value: false });
    }
  };

  const handleStatusChange = async (issueId: string, newStatus: string) => {
    try {
      const issue = state.issues.find((i) => i.id === issueId);
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
      logger.error("Failed to update issue:", { error: serialiseError(err) });
    }
  };

  const filteredAndSortedIssues = useMemo(() => {
    let filtered = state.issues;

    if (state.levelFilter !== "all") {
      filtered = filtered.filter((issue) => issue.level === state.levelFilter);
    }

    const sorted = [...filtered];
    if (state.sortBy === "recent") {
      sorted.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    } else if (state.sortBy === "oldest") {
      sorted.sort((a, b) => a.firstSeenAt - b.firstSeenAt);
    } else if (state.sortBy === "count") {
      sorted.sort((a, b) => b.eventCount - a.eventCount);
    }

    return sorted;
  }, [state.issues, state.levelFilter, state.sortBy]);

  const issueStatusCounts = useMemo(() => {
    return state.issues.reduce(
      (acc, issue) => {
        if (issue.status === "unresolved") acc.unresolved += 1;
        else if (issue.status === "resolved") acc.resolved += 1;
        else if (issue.status === "ignored") acc.ignored += 1;
        return acc;
      },
      { unresolved: 0, resolved: 0, ignored: 0 }
    );
  }, [state.issues]);

  const releaseOptions = useMemo(() => {
    const set = new Set<string>();
    for (const issue of state.issues) {
      if (issue.lastSeenRelease) set.add(issue.lastSeenRelease);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [state.issues]);

  const environmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const issue of state.issues) {
      if (issue.lastSeenEnvironment) set.add(issue.lastSeenEnvironment);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [state.issues]);

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
              { id: "events", label: "Events" },
              { id: "analytics", label: "Analytics" },
              {
                id: "grouping",
                label: "Grouping",
              },
            ]}
            activeTab={state.activeTab}
            onTabChange={(tabId) =>
              dispatch({ type: "setActiveTab", value: tabId as TabId })
            }
          />
        </CardTitle>

        {state.activeTab === "issues" && (
          <div className="mb-4 space-y-3 border-b border-[color:var(--stroke)] pb-4">
            <div className="flex flex-wrap gap-2">
              <Badge
                size="small"
                variant={
                  state.statusFilter === "unresolved" ? "danger" : "default"
                }
              >
                Open: {issueStatusCounts.unresolved}
              </Badge>
              <Badge
                size="small"
                variant={
                  state.statusFilter === "resolved" ? "success" : "default"
                }
              >
                Resolved: {issueStatusCounts.resolved}
              </Badge>
              <Badge
                size="small"
                variant={state.statusFilter === "ignored" ? "muted" : "default"}
              >
                Ignored: {issueStatusCounts.ignored}
              </Badge>
            </div>

            <input
              type="text"
              placeholder="Search issues..."
              value={state.searchQuery}
              onChange={(e) =>
                dispatch({ type: "setSearchQuery", value: e.target.value })
              }
              className="w-full rounded-lg border border-[color:var(--stroke)] bg-white px-3 py-2"
            />

            <div className="flex flex-wrap gap-2">
              <select
                value={state.statusFilter}
                onChange={(e) =>
                  dispatch({ type: "setStatusFilter", value: e.target.value })
                }
                className="flex-none"
              >
                <option value="all">All Statuses</option>
                <option value="unresolved">Unresolved</option>
                <option value="resolved">Resolved</option>
                <option value="ignored">Ignored</option>
              </select>
              <select
                value={state.levelFilter}
                onChange={(e) =>
                  dispatch({ type: "setLevelFilter", value: e.target.value })
                }
                className="flex-none"
              >
                <option value="all">All Levels</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
              <select
                value={state.sortBy}
                onChange={(e) =>
                  dispatch({
                    type: "setSortBy",
                    value: e.target.value as "recent" | "oldest" | "count",
                  })
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
                value={state.releaseFilter}
                onChange={(e) =>
                  dispatch({ type: "setReleaseFilter", value: e.target.value })
                }
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
                value={state.environmentFilter}
                onChange={(e) =>
                  dispatch({
                    type: "setEnvironmentFilter",
                    value: e.target.value,
                  })
                }
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
                value={state.assigneeFilter}
                onChange={(e) =>
                  dispatch({ type: "setAssigneeFilter", value: e.target.value })
                }
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
                  checked={state.includeSnoozed}
                  onChange={(e) =>
                    dispatch({
                      type: "setIncludeSnoozed",
                      value: e.target.checked,
                    })
                  }
                />
                Include snoozed
              </label>
              <button
                type="button"
                className="outline"
                onClick={() => refreshIssues()}
                disabled={state.isRefreshingIssues}
              >
                {state.isRefreshingIssues ? "Refreshing..." : "Apply"}
              </button>
            </div>
          </div>
        )}

        <div className="list">
          {state.activeTab === "issues" ? (
            <ListContainer
              isEmpty={!filteredAndSortedIssues.length}
              emptyMessage={
                state.searchQuery ||
                state.statusFilter !== "all" ||
                state.levelFilter !== "all" ||
                state.releaseFilter !== "all" ||
                state.environmentFilter !== "all" ||
                state.assigneeFilter !== "all"
                  ? "No issues match your filters."
                  : "No issues found."
              }
            >
              {filteredAndSortedIssues.map((issue, index) => (
                <ListRow
                  key={issue.id}
                   isOdd={index > 0}
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
          ) : state.activeTab === "events" ? (
            isSecondaryDataLoading ? (
              <TabLoadingFallback />
            ) : secondaryDataError ? (
              <div className="muted">{secondaryDataError}</div>
            ) : secondaryData ? (
              secondaryData.events.length ? (
                secondaryData.events.map((event) => (
                  <EventItem key={event.id} event={event} projectId={projectId} />
                ))
              ) : (
                <div className="muted">No events found.</div>
              )
            ) : (
              <TabLoadingFallback />
            )
          ) : state.activeTab === "analytics" ? (
            <Suspense fallback={<TabLoadingFallback />}>
              <AnalyticsTab projectId={projectId} />
            </Suspense>
          ) : state.activeTab === "grouping" ? (
            <Suspense fallback={<TabLoadingFallback />}>
              {isSecondaryDataLoading ? (
                <TabLoadingFallback />
              ) : secondaryDataError ? (
                <div className="p-4 muted">{secondaryDataError}</div>
              ) : secondaryData ? (
                <GroupingTab
                  projectId={projectId}
                  initialRules={secondaryData.rules}
                />
              ) : (
                <TabLoadingFallback />
              )}
            </Suspense>
          ) : null}
        </div>
      </Card>

      <Suspense fallback={null}>
        <Await promise={membersPromise}>
          {(loaded: TeamMember[]) => (
            <MembersHydrator members={loaded} onLoaded={setMembers} />
          )}
        </Await>
      </Suspense>
    </div>
  );
}
