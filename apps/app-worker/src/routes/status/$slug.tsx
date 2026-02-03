import { createFileRoute, Link } from "@tanstack/react-router";

import { getPublicStatusFn } from "@/server/functions/public";
import { HistoricalUptimeBar } from "@/components/HistoricalUptimeBar";
import type { StatusSnapshot } from "@/server/services/status-snapshots";

export const Route = createFileRoute("/status/$slug")({
  component: PublicStatusPage,
  loader: async ({ params }): Promise<StatusSnapshot> => {
    const snapshot = await getPublicStatusFn({ data: { slug: params.slug } });
    return snapshot;
  },
  notFoundComponent: () => {
    return (
      <div className="auth">
        <div className="auth-card">
          <h1>Status page not found</h1>
          <p>The status page you're looking for doesn't exist.</p>
          <Link to="/">
            <button type="button">Go home</button>
          </Link>
        </div>
      </div>
    );
  },
});

function PublicStatusPage() {
  const snapshot = Route.useLoaderData();
  const { page, components, incidents } = snapshot;

  const activeIncidents = incidents.filter((i) => i.status !== "resolved");
  const pastIncidents = incidents.filter((i) => i.status === "resolved");

  const statusIcon = (status: "up" | "down" | "unknown") => {
    switch (status) {
      case "up":
        return <span className="status-indicator status-up">●</span>;
      case "down":
        return <span className="status-indicator status-down">●</span>;
      default:
        return <span className="status-indicator status-unknown">●</span>;
    }
  };

  const formatDate = (dateStrOrTimestamp: string | number) => {
    const timestamp =
      typeof dateStrOrTimestamp === "string"
        ? dateStrOrTimestamp
        : dateStrOrTimestamp * 1000;
    const date = new Date(timestamp);
    return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  };

  return (
    <>
      <style>
        {`
          .status-page {
            max-width: 960px;
            margin: 0 auto;
            padding: 2rem 1rem;
            font-family: system-ui, -apple-system, sans-serif;
          }

          .status-header {
            text-align: center;
            margin-bottom: 3rem;
          }

          .status-logo {
            max-width: 200px;
            height: auto;
            margin-bottom: 1rem;
          }

          .status-title {
            font-size: 2rem;
            font-weight: 600;
            margin: 0;
            color: #1a1a1a;
          }

          .status-section {
            margin-bottom: 2rem;
            background: white;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            padding: 1.5rem;
          }

          .status-section-title {
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0 0 1rem 0;
            color: #1a1a1a;
          }

          .component-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .component-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem;
            border-radius: 4px;
            background: #f9fafb;
            gap: 0.75rem;
          }

          .component-name {
            font-weight: 500;
            color: #374151;
          }

          .component-description {
            font-size: 0.875rem;
            color: #6b7280;
            margin-top: 0.25rem;
            overflow-wrap: anywhere;
          }

          .status-indicator {
            font-size: 1.5rem;
            line-height: 1;
          }

          .status-up {
            color: #10b981;
          }

          .status-down {
            color: #ef4444;
          }

          .status-unknown {
            color: #6b7280;
          }

          .incident-item {
            padding: 1rem;
            background: #f9fafb;
            border-radius: 4px;
            margin-bottom: 1rem;
          }

          .incident-item.investigating {
            border-left: 4px solid #f59e0b;
          }

          .incident-item.identified {
            border-left: 4px solid #ef4444;
          }

          .incident-item.monitoring {
            border-left: 4px solid #3b82f6;
          }

          .incident-item.resolved {
            border-left: 4px solid #10b981;
          }

          .incident-title {
            font-weight: 600;
            font-size: 1.125rem;
            margin: 0 0 0.5rem 0;
            color: #1a1a1a;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            overflow-wrap: anywhere;
          }

          .incident-status-badge {
            display: inline-block;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.025em;
          }

          .incident-status-badge.investigating {
            background: #fef3c7;
            color: #92400e;
          }

          .incident-status-badge.identified {
            background: #fee2e2;
            color: #991b1b;
          }

          .incident-status-badge.monitoring {
            background: #dbeafe;
            color: #1e40af;
          }

          .incident-status-badge.resolved {
            background: #d1fae5;
            color: #065f46;
          }

          .incident-meta {
            font-size: 0.875rem;
            color: #6b7280;
            margin-bottom: 1rem;
          }

          .incident-updates {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }

          .incident-update {
            padding: 0.75rem;
            background: white;
            border-radius: 4px;
            border: 1px solid #e5e7eb;
          }

          .update-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
            gap: 0.5rem;
          }

          .update-status {
            font-weight: 600;
            font-size: 0.875rem;
            text-transform: capitalize;
            color: ${page.brand_color};
          }

          .update-time {
            font-size: 0.875rem;
            color: #6b7280;
          }

          .update-message {
            color: #374151;
            line-height: 1.5;
            overflow-wrap: anywhere;
          }

          .overall-status {
            text-align: center;
            padding: 1rem;
            border-radius: 8px;
            font-weight: 600;
            margin-bottom: 2rem;
          }

          .overall-status.operational {
            background: #d1fae5;
            color: #065f46;
          }

          .overall-status.degraded {
            background: #fee2e2;
            color: #991b1b;
          }

          .footer {
            text-align: center;
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 0.875rem;
          }

          .powered-by {
            margin-top: 0.75rem;
            font-size: 0.8125rem;
          }

          .powered-by a {
            color: ${page.brand_color};
            text-decoration: none;
            font-weight: 500;
          }

          .powered-by a:hover {
            text-decoration: underline;
          }

          .uptime-header-section {
            margin-bottom: 1rem;
          }

          .uptime-subtitle {
            font-size: 0.875rem;
            color: #6b7280;
            margin: 0.5rem 0 0 0;
          }

          .historical-uptime-container {
            margin-top: 1.5rem;
          }

          .uptime-footer {
            margin-top: 0.75rem;
            padding-top: 0.5rem;
          }

          .time-labels {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: #9ca3af;
          }

          @media (max-width: 768px) {
            .status-page {
              padding: 1.25rem 0.875rem;
            }

            .status-header {
              margin-bottom: 2rem;
            }

            .status-title {
              font-size: 1.625rem;
            }

            .status-section {
              padding: 1rem;
              border-radius: 12px;
            }

            .component-item {
              align-items: flex-start;
            }

            .incident-title {
              flex-wrap: wrap;
            }

            .update-header {
              flex-wrap: wrap;
              align-items: flex-start;
            }
          }

          ${page.custom_css || ""}
        `}
      </style>

      <div className="status-page">
        <div className="status-header">
          {page.logo_url && (
            <img src={page.logo_url} alt={page.name} className="status-logo" />
          )}
          <h1 className="status-title">{page.name}</h1>
        </div>

        {components.length > 0 && (
          <>
            <div
              className={`overall-status ${components.some((c) => c.status === "down") ? "degraded" : "operational"}`}
            >
              {components.some((c) => c.status === "down")
                ? "Some systems are experiencing issues"
                : "All systems operational"}
            </div>

            <div className="status-section">
              <h2 className="status-section-title">Current status</h2>
              <div className="component-list">
                {components.map((component) => (
                  <div key={component.id} className="component-item">
                    <div>
                      <div className="component-name">{component.name}</div>
                      {component.description && (
                        <div className="component-description">
                          {component.description}
                        </div>
                      )}
                    </div>
                    {statusIcon(component.status)}
                  </div>
                ))}
              </div>
            </div>

            {components.some(
              (c) => c.historical_data && c.historical_data.length > 0,
            ) && (
              <div className="status-section">
                <div className="uptime-header-section">
                  <h2 className="status-section-title">
                    Uptime over the past 90 days
                  </h2>
                  <p className="uptime-subtitle">View historical uptime.</p>
                </div>
                <div className="historical-uptime-container">
                  {components.map((component) => {
                    if (
                      !component.historical_data ||
                      component.historical_data.length === 0
                    ) {
                      return null;
                    }
                    return (
                      <HistoricalUptimeBar
                        key={component.id}
                        data={component.historical_data}
                        componentName={component.name}
                        overallUptime={component.overall_uptime || 100}
                      />
                    );
                  })}
                </div>
                <div className="uptime-footer">
                  <div className="time-labels">
                    <span>90 days ago</span>
                    <span>Today</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeIncidents.length > 0 && (
          <div className="status-section">
            <h2 className="status-section-title">Active incidents</h2>
            {activeIncidents.map((incident) => (
              <div
                key={incident.id}
                className={`incident-item ${incident.status}`}
              >
                <h3 className="incident-title">
                  {incident.title}
                  <span className={`incident-status-badge ${incident.status}`}>
                    {incident.status}
                  </span>
                </h3>
                <div className="incident-meta">
                  Started: {formatDate(incident.started_at)}
                </div>
                {incident.updates.length > 0 && (
                  <div className="incident-updates">
                    {incident.updates.map((update) => (
                      <div key={update.id} className="incident-update">
                        <div className="update-header">
                          <span className="update-status">{update.status}</span>
                          <span className="update-time">
                            {formatDate(update.created_at)}
                          </span>
                        </div>
                        <div className="update-message">{update.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {pastIncidents.length > 0 && (
          <div className="status-section">
            <h2 className="status-section-title">Past incidents</h2>
            {pastIncidents.map((incident) => (
              <div
                key={incident.id}
                className={`incident-item ${incident.status}`}
              >
                <h3 className="incident-title">
                  {incident.title}
                  <span className={`incident-status-badge ${incident.status}`}>
                    {incident.status}
                  </span>
                </h3>
                <div className="incident-meta">
                  Started: {formatDate(incident.started_at)}
                  {incident.resolved_at && (
                    <> • Resolved: {formatDate(incident.resolved_at)}</>
                  )}
                </div>
                {incident.updates.length > 0 && (
                  <div className="incident-updates">
                    {incident.updates.map((update) => (
                      <div key={update.id} className="incident-update">
                        <div className="update-header">
                          <span className="update-status">{update.status}</span>
                          <span className="update-time">
                            {formatDate(update.created_at)}
                          </span>
                        </div>
                        <div className="update-message">{update.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {components.length === 0 &&
          activeIncidents.length === 0 &&
          pastIncidents.length === 0 && (
            <div className="status-section">
              <p style={{ textAlign: "center", color: "#6b7280" }}>
                No components or incidents to display
              </p>
            </div>
          )}

        <div className="footer">
          Last updated: {formatDate(snapshot.generated_at)}
          <div className="powered-by">
            Powered by{" "}
            <a
              href="https://bitwobbly.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              BitWobbly
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
