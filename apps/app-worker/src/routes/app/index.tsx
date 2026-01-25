import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { listMonitorsFn } from "@/server/functions/monitors";
import { listStatusPagesFn } from "@/server/functions/status-pages";

export const Route = createFileRoute("/app/")({
  component: Overview,
  loader: async () => {
    const [monitorsRes, pagesRes] = await Promise.all([
      listMonitorsFn(),
      listStatusPagesFn(),
    ]);
    return {
      monitors: monitorsRes.monitors,
      status_pages: pagesRes.status_pages,
    };
  },
});

function Overview() {
  const { monitors, status_pages: pages } = Route.useLoaderData();

  const [error] = useState<string | null>(null);

  const upCount = monitors.filter((m) => m.state?.last_status === "up").length;
  const downCount = monitors.filter(
    (m) => m.state?.last_status === "down",
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

      {error ? <div className="card error">{error}</div> : null}

      <div className="grid metrics">
        <div className="card">
          <div className="metric-label">Monitors up</div>
          <div className="metric-value">{upCount}</div>
        </div>
        <div className="card">
          <div className="metric-label">Monitors down</div>
          <div className="metric-value">{downCount}</div>
        </div>
        <div className="card">
          <div className="metric-label">Unknown</div>
          <div className="metric-value">{unknownCount}</div>
        </div>
        <div className="card">
          <div className="metric-label">Status pages</div>
          <div className="metric-value">{pages.length}</div>
        </div>
      </div>

      <div className="grid two">
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
                    className={`status ${monitor.state?.last_status || "unknown"}`}
                  >
                    {monitor.state?.last_status || "unknown"}
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
            {pages.length ? (
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
