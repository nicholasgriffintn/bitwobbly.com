import { createFileRoute, Link } from '@tanstack/react-router';

import { listMonitorsFn } from '@/server/functions/monitors';
import { listStatusPagesFn } from '@/server/functions/status-pages';
import { listOpenIncidentsFn } from '@/server/functions/incidents';
import { listChannelsFn } from '@/server/functions/notification-channels';

export const Route = createFileRoute('/app/')({
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

  const upCount = monitors.filter((m) => m.state?.lastStatus === 'up').length;
  const downCount = monitors.filter(
    (m) => m.state?.lastStatus === 'down',
  ).length;

  const overallStatus =
    downCount > 0 ? 'degraded' : upCount > 0 ? 'operational' : 'unknown';

  return (
    <div className="page">
      <div className="page-header mb-6">
        <div>
          <h2>System overview</h2>
          <p>Watch the fleet and keep stakeholders informed.</p>
        </div>
        <div className="button-row">
          <Link to="/app/monitors">
            <button type="button" className="outline">
              Add monitor
            </button>
          </Link>
          <Link to="/app/status-pages">
            <button type="button">Create status page</button>
          </Link>
        </div>
      </div>

      <div className="card mb-1.5">
        <div className="flex items-center gap-3">
          <span
            className={`status-indicator ${overallStatus} w-3 h-3 rounded-full`}
            style={{
              backgroundColor:
                overallStatus === 'operational'
                  ? 'var(--green)'
                  : overallStatus === 'degraded'
                    ? 'var(--red)'
                    : 'var(--muted)',
            }}
          />
          <div>
            <div className="font-semibold text-lg">
              {overallStatus === 'operational'
                ? 'All systems operational'
                : overallStatus === 'degraded'
                  ? 'System degraded'
                  : 'No monitors configured'}
            </div>
            <div className="muted">
              {upCount} up · {downCount} down · {incidents.length} open incident
              {incidents.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="grid metrics mb-1.5">
        <div className="card">
          <div className="metric-label">Monitors up</div>
          <div className="metric-value" style={{ color: 'var(--green)' }}>
            {upCount}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Monitors down</div>
          <div
            className="metric-value"
            style={{ color: downCount > 0 ? 'var(--red)' : undefined }}
          >
            {downCount}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Open incidents</div>
          <div
            className="metric-value"
            style={{
              color: incidents.length > 0 ? 'var(--orange)' : undefined,
            }}
          >
            {incidents.length}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Status pages</div>
          <div className="metric-value">{pages.length}</div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-title">Getting started</div>
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
        </div>

        <div className="card">
          <div className="card-title">Quick setup</div>
          <div className="list">
            <div className="list-row">
              <div>
                <div className="list-title">Monitors</div>
                <div className="muted">{monitors.length} configured</div>
              </div>
              {monitors.length === 0 ? (
                <Link to="/app/monitors">
                  <button type="button" className="outline">
                    Add first
                  </button>
                </Link>
              ) : (
                <span className="pill small">done</span>
              )}
            </div>
            <div className="list-row">
              <div>
                <div className="list-title">Notification channels</div>
                <div className="muted">{channels.length} configured</div>
              </div>
              {channels.length === 0 ? (
                <Link to="/app/notifications">
                  <button type="button" className="outline">
                    Add first
                  </button>
                </Link>
              ) : (
                <span className="pill small">done</span>
              )}
            </div>
            <div className="list-row">
              <div>
                <div className="list-title">Status pages</div>
                <div className="muted">{pages.length} configured</div>
              </div>
              {pages.length === 0 ? (
                <Link to="/app/status-pages">
                  <button type="button" className="outline">
                    Add first
                  </button>
                </Link>
              ) : (
                <span className="pill small">done</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {incidents.length > 0 && (
        <div className="card mb-1.5">
          <div className="card-title">Active incidents</div>
          <div className="list">
            {incidents.slice(0, 3).map((incident) => (
              <div key={incident.id} className="list-row">
                <div>
                  <div className="list-title">
                    {incident.title}
                    <span
                      className={`status-pill ${incident.status}`}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      {incident.status}
                    </span>
                  </div>
                  <div className="muted">
                    Started{' '}
                    {new Date(incident.startedAt * 1000).toLocaleString()}
                  </div>
                </div>
                <Link to="/app/incidents">
                  <button type="button" className="outline">
                    View
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid two mb-1.5">
        <div className="card">
          <div className="card-title">Recent monitors</div>
          <div className="list">
            {monitors.length ? (
              monitors.slice(0, 5).map((monitor) => (
                <div key={monitor.id} className="list-row">
                  <div>
                    <div className="list-title">{monitor.name}</div>
                    <div className="muted">{monitor.url}</div>
                  </div>
                  <span
                    className={`status ${monitor.state?.lastStatus || 'unknown'}`}
                  >
                    {monitor.state?.lastStatus || 'unknown'}
                  </span>
                </div>
              ))
            ) : (
              <div className="muted">No monitors yet.</div>
            )}
            {monitors.length > 0 && (
              <Link to="/app/monitors">
                <button type="button" className="outline w-full mt-2">
                  View all monitors
                </button>
              </Link>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Status pages</div>
          <div className="list">
            {pages.length ? (
              pages.slice(0, 5).map((page) => (
                <div key={page.id} className="list-row">
                  <div>
                    <div className="list-title">{page.name}</div>
                    <div className="muted">/{page.slug}</div>
                  </div>
                  <button
                    type="button"
                    className="outline"
                    onClick={() =>
                      window.open(`/status/${page.slug}`, '_blank')
                    }
                  >
                    View
                  </button>
                </div>
              ))
            ) : (
              <div className="muted">No status pages yet.</div>
            )}
            {pages.length > 0 && (
              <Link to="/app/status-pages">
                <button type="button" className="outline w-full mt-2">
                  Manage status pages
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
