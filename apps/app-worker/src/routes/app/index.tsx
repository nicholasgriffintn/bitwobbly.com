import { createFileRoute, Link } from "@tanstack/react-router";

import { listMonitorsFn } from "@/server/functions/monitors";
import { listStatusPagesFn } from "@/server/functions/status-pages";
import { listOpenIncidentsFn } from "@/server/functions/incidents";
import { listChannelsFn } from "@/server/functions/notification-channels";
import { toTitleCase } from "@/utils/format";
import { Card, CardTitle, Page, PageHeader } from "@/components/layout";
import { ListContainer, ListRow } from "@/components/list";
import { Badge, Button, StatusBadge, isStatusType } from "@/components/ui";

export const Route = createFileRoute("/app/")({
  component: Overview,
  loader: async () => {
    const [monitorsRes, pagesRes, incidentsRes, channelsRes] =
      await Promise.all([
        listMonitorsFn(),
        listStatusPagesFn(),
        listOpenIncidentsFn(),
        listChannelsFn(),
      ]);
    return {
      monitors: monitorsRes.monitors,
      status_pages: pagesRes.status_pages,
      incidents: incidentsRes.incidents,
      channels: channelsRes.channels,
    };
  },
});

function Overview() {
  const {
    monitors,
    status_pages: pages,
    incidents,
    channels,
  } = Route.useLoaderData();

  const upCount = monitors.filter((m) => m.state?.lastStatus === "up").length;
  const downCount = monitors.filter(
    (m) => m.state?.lastStatus === "down"
  ).length;

  const overallStatus =
    downCount > 0 ? "degraded" : upCount > 0 ? "operational" : "unknown";

  const hasCompletedSetup =
    monitors.length > 0 && channels.length > 0 && pages.length > 0;

  return (
    <Page className="page-stack">
      <PageHeader
        title="System overview"
        description="A top-level view of your monitoring and incident status."
      >
        <div className="button-row">
          <Link to="/app/monitors">
            <Button type="button" variant="outline">
              Add monitor
            </Button>
          </Link>
          <Link to="/app/status-pages">
            <Button type="button">Create status page</Button>
          </Link>
        </div>
      </PageHeader>

      <Card>
        <div className="flex items-center gap-3">
          <span
            className={`status-indicator ${overallStatus} h-3 w-3 rounded-full ${
              overallStatus === "operational"
                ? "bg-[color:var(--green)]"
                : overallStatus === "degraded"
                  ? "bg-[color:var(--red)]"
                  : "bg-[color:var(--muted)]"
            }`}
          />
          <div>
            <div className="font-semibold text-lg">
              {overallStatus === "operational"
                ? "All systems operational"
                : overallStatus === "degraded"
                  ? "System degraded"
                  : "No monitors configured"}
            </div>
            <div className="muted">
              {upCount} up · {downCount} down · {incidents.length} open incident
              {incidents.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid metrics">
        <div className="card">
          <div className="metric-label">Monitors up</div>
          <div className="metric-value text-[color:var(--green)]">
            {upCount}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Monitors down</div>
          <div
            className={`metric-value ${
              downCount > 0 ? "text-[color:var(--red)]" : ""
            }`}
          >
            {downCount}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Open incidents</div>
          <div
            className={`metric-value ${
              incidents.length > 0 ? "text-[color:var(--orange)]" : ""
            }`}
          >
            {incidents.length}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Status pages</div>
          <div className="metric-value">{pages.length}</div>
        </div>
      </div>

      {!hasCompletedSetup && (
        <div className="grid two">
          <Card>
            <CardTitle>Getting started</CardTitle>
            <div className="list">
              <div className="list-row">
                <div className="muted">
                  1. Create monitors to track your endpoints
                </div>
              </div>
              <div className="list-row">
                <div className="muted">2. Group monitors into components</div>
              </div>
              <div className="list-row">
                <div className="muted">3. Set up notification channels</div>
              </div>
              <div className="list-row">
                <div className="muted">4. Create a public status page</div>
              </div>
              <div className="list-row">
                <div className="muted">
                  5. Link components to your status page
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>Quick setup</CardTitle>
            <ListContainer isEmpty={false}>
              <ListRow
                title="Monitors"
                subtitle={`${monitors.length} configured`}
                actions={
                  monitors.length === 0 ? (
                    <Link to="/app/monitors">
                      <Button type="button" variant="outline" color="success">
                        Add first
                      </Button>
                    </Link>
                  ) : (
                    <Badge size="small" variant="success">
                      Done
                    </Badge>
                  )
                }
              />
              <ListRow
                title="Notification channels"
                subtitle={`${channels.length} configured`}
                actions={
                  channels.length === 0 ? (
                    <Link to="/app/notifications">
                      <Button type="button" variant="outline" color="success">
                        Add first
                      </Button>
                    </Link>
                  ) : (
                    <Badge size="small" variant="success">
                      Done
                    </Badge>
                  )
                }
              />
              <ListRow
                title="Status pages"
                subtitle={`${pages.length} configured`}
                actions={
                  pages.length === 0 ? (
                    <Link to="/app/status-pages">
                      <Button type="button" variant="outline" color="success">
                        Add first
                      </Button>
                    </Link>
                  ) : (
                    <Badge size="small" variant="success">
                      Done
                    </Badge>
                  )
                }
              />
            </ListContainer>
          </Card>
        </div>
      )}

      {incidents.length > 0 && (
        <Card>
          <CardTitle
            actions={
              <Link className="card-title-link" to="/app/incidents">
                View all
              </Link>
            }
          >
            Active incidents
          </CardTitle>
          <ListContainer isEmpty={false}>
            {incidents.slice(0, 3).map((incident) => (
              <ListRow
                key={incident.id}
                title={
                  <>
                    {incident.title}
                    <StatusBadge
                      className="ml-2"
                      status={
                        isStatusType(incident.status)
                          ? incident.status
                          : "unknown"
                      }
                    >
                      {toTitleCase(
                        isStatusType(incident.status)
                          ? incident.status
                          : "unknown"
                      )}
                    </StatusBadge>
                  </>
                }
                subtitle={`Started ${new Date(incident.startedAt * 1000).toLocaleString()}`}
                actions={
                  <Link to="/app/incidents">
                    <Button type="button" variant="outline">
                      View
                    </Button>
                  </Link>
                }
              />
            ))}
          </ListContainer>
        </Card>
      )}

      <div className="grid two">
        <Card>
          <CardTitle
            actions={
              monitors.length > 0 ? (
                <Link className="card-title-link" to="/app/monitors">
                  View all
                </Link>
              ) : null
            }
          >
            Recent monitors
          </CardTitle>
          <ListContainer
            isEmpty={!monitors.length}
            emptyMessage="No monitors yet."
          >
            {monitors.slice(0, 5).map((monitor) => {
              const rawStatus = monitor.state?.lastStatus ?? "unknown";
              const status = isStatusType(rawStatus) ? rawStatus : "unknown";

              return (
                <ListRow
                  key={monitor.id}
                  title={
                    <>
                      {monitor.name}
                      <StatusBadge className="ml-2" status={status}>
                        {toTitleCase(status)}
                      </StatusBadge>
                    </>
                  }
                  subtitle={monitor.url}
                />
              );
            })}
          </ListContainer>
        </Card>

        <Card>
          <CardTitle
            actions={
              pages.length > 0 ? (
                <Link className="card-title-link" to="/app/status-pages">
                  View all
                </Link>
              ) : null
            }
          >
            Status pages
          </CardTitle>
          <ListContainer
            isEmpty={!pages.length}
            emptyMessage="No status pages yet."
          >
            {pages.slice(0, 5).map((page) => (
              <ListRow
                key={page.id}
                title={page.name}
                subtitle={`/${page.slug}`}
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      window.open(`/status/${page.slug}`, "_blank")
                    }
                  >
                    View
                  </Button>
                }
              />
            ))}
          </ListContainer>
        </Card>
      </div>
    </Page>
  );
}
