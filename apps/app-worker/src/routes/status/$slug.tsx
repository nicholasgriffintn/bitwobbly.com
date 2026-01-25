import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicStatusFn } from "@/server/functions/public";

type ComponentStatus = {
  id: string;
  name: string;
  description: string | null;
  status: "up" | "down" | "unknown";
};

type IncidentUpdate = {
  id: string;
  message: string;
  status: string;
  created_at: string;
};

type Incident = {
  id: string;
  title: string;
  status: string;
  started_at: string;
  resolved_at: string | null;
  updates: IncidentUpdate[];
};

type StatusSnapshot = {
  generated_at: string;
  page: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    brand_color: string;
    custom_css: string | null;
  };
  components: ComponentStatus[];
  incidents: Incident[];
};

export const Route = createFileRoute("/status/$slug")({
  component: PublicStatusPage,
  loader: async ({ params }) => {
    const snapshot = await getPublicStatusFn({ data: { slug: params.slug } });
    return snapshot as StatusSnapshot;
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
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
          }

          .component-name {
            font-weight: 500;
            color: #374151;
          }

          .component-description {
            font-size: 0.875rem;
            color: #6b7280;
            margin-top: 0.25rem;
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
            border-left: 3px solid ${page.brand_color};
            background: #f9fafb;
            border-radius: 4px;
            margin-bottom: 1rem;
          }

          .incident-title {
            font-weight: 600;
            font-size: 1.125rem;
            margin: 0 0 0.5rem 0;
            color: #1a1a1a;
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
          </>
        )}

        {incidents.length > 0 && (
          <div className="status-section">
            <h2 className="status-section-title">Active incidents</h2>
            {incidents.map((incident) => (
              <div key={incident.id} className="incident-item">
                <h3 className="incident-title">{incident.title}</h3>
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

        {components.length === 0 && incidents.length === 0 && (
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
