import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';

import { listMonitorsFn } from '@/server/functions/monitors';
import { listStatusPagesFn } from '@/server/functions/status-pages';

export const Route = createFileRoute('/app/')({
  component: Overview,
  loader: async () => {
    const [monitorsRes, pagesRes] = await Promise.all([
      listMonitorsFn(),
      listStatusPagesFn()
    ]);
    return {
      monitors: monitorsRes.monitors,
      status_pages: pagesRes.status_pages
    };
  }
});

function Overview() {
  const { monitors, status_pages: pages } = Route.useLoaderData();

  // Note: loading state is handled by Route loader implicitly (suspense), or we can add pendingComponent
  const loading = false; // Loaded by loader
  const [error] = useState<string | null>(null);

  const upCount = monitors.filter((m) => m.state?.last_status === 'up').length;
  const downCount = monitors.filter(
    (m) => m.state?.last_status === 'down',
  ).length;
  const unknownCount = monitors.length - upCount - downCount;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>System overview</h2>
          <p>Watch the fleet and keep stakeholders informed.</p>
        </div>
        <div className="button-row">
          <button type="button" className="outline">
            Add monitor
          </button>
          <button type="button">Create status page</button>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="grid metrics">
        <div className="card">
          <div className="metric-label">Monitors up</div>
          <div className="metric-value">{loading ? '—' : upCount}</div>
        </div>
        <div className="card">
          <div className="metric-label">Monitors down</div>
          <div className="metric-value">{loading ? '—' : downCount}</div>
        </div>
        <div className="card">
          <div className="metric-label">Unknown</div>
          <div className="metric-value">{loading ? '—' : unknownCount}</div>
        </div>
        <div className="card">
          <div className="metric-label">Status pages</div>
          <div className="metric-value">{loading ? '—' : pages.length}</div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-title">Recent monitors</div>
          <div className="list">
            {loading ? (
              <div className="muted">Loading monitors...</div>
            ) : monitors.length ? (
              monitors.slice(0, 5).map((monitor) => (
                <div key={monitor.id} className="list-row">
                  <div>
                    <div className="list-title">{monitor.name}</div>
                    <div className="muted">{monitor.url}</div>
                  </div>
                  <span
                    className={`status ${monitor.state?.last_status || 'unknown'}`}
                  >
                    {monitor.state?.last_status || 'unknown'}
                  </span>
                </div>
              ))
            ) : (
              <div className="muted">No monitors yet.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Public status</div>
          <div className="list">
            {loading ? (
              <div className="muted">Loading status pages...</div>
            ) : pages.length ? (
              pages.slice(0, 5).map((page) => (
                <div key={page.id} className="list-row">
                  <div>
                    <div className="list-title">{page.name}</div>
                    <div className="muted">/{page.slug}</div>
                  </div>
                  <span className="pill small">public</span>
                </div>
              ))
            ) : (
              <div className="muted">No status pages yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
