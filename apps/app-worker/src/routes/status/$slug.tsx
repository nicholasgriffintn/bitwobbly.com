import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import {
  getPublicStatusFn,
  type PublicStatusResult,
} from "@/server/functions/public";
import { subscribeToStatusPageFn } from "@/server/functions/status-page-subscribers";
import { HistoricalUptimeBar } from "@/components/HistoricalUptimeBar";
import { StatusBadge, isStatusType } from "@/components/ui";
import { PrivateStatusPasswordGate } from "@/components/status/PrivateStatusPasswordGate";
import { Modal } from "@/components/Modal";

export const Route = createFileRoute("/status/$slug")({
  component: StatusPage,
  loader: async ({ params }): Promise<PublicStatusResult> => {
    return await getPublicStatusFn({ data: { slug: params.slug } });
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

function StatusPage() {
  const data = Route.useLoaderData();
  const { slug } = Route.useParams();
  const subscribeToStatusPage = useServerFn(subscribeToStatusPageFn);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [isApiHelpOpen, setIsApiHelpOpen] = useState(false);
  const [subscribeChannel, setSubscribeChannel] = useState<"email" | "webhook">(
    "email"
  );
  const [subscribeCadence, setSubscribeCadence] = useState<
    "immediate" | "daily" | "weekly"
  >("immediate");
  const [subscribeEndpoint, setSubscribeEndpoint] = useState("");
  const [subscribeResult, setSubscribeResult] = useState<
    | null
    | { kind: "idle" }
    | { kind: "working" }
    | { kind: "success"; message: string; unsubscribeUrl?: string }
    | { kind: "error"; message: string }
  >(null);

  if (data.kind === "password_required") {
    return <PrivateStatusPasswordGate slug={slug} page={data.page} />;
  }

  const snapshot = data.snapshot;
  const { page, components, incidents } = snapshot;
  const brandColor = page.brand_color || "#007bff";
  const origin =
    typeof window === "undefined"
      ? "https://<your-domain>"
      : window.location.origin;
  const encodedSlug = encodeURIComponent(slug);
  const availabilityApiBase = `${origin}/api/status/${encodedSlug}`;
  const exampleComponentId = components[0]?.id;

  const activeIncidents = incidents.filter((i) => i.status !== "resolved");
  const pastIncidents = incidents.filter((i) => i.status === "resolved");

  const statusIcon = (status: "up" | "down" | "unknown" | "maintenance") => {
    switch (status) {
      case "up":
        return <span className="status-indicator status-up">●</span>;
      case "down":
        return <span className="status-indicator status-down">●</span>;
      case "maintenance":
        return <span className="status-indicator status-maintenance">●</span>;
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

  const onSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    setSubscribeResult({ kind: "working" });

    try {
      if (!subscribeEndpoint.trim()) {
        setSubscribeResult({ kind: "error", message: "Enter a destination" });
        return;
      }

      const res = await subscribeToStatusPage({
        data: {
          slug,
          channel_type: subscribeChannel,
          endpoint: subscribeEndpoint.trim(),
          digest_cadence: subscribeCadence,
        },
      });

      if (res.kind === "already_subscribed") {
        setSubscribeResult({
          kind: "success",
          message: "You're already subscribed to updates for this status page.",
        });
        return;
      }

      if (res.kind === "password_required") {
        setSubscribeResult({
          kind: "error",
          message: "This status page requires a password to subscribe.",
        });
        return;
      }

      if (res.kind === "webhook_verification_queued") {
        const unsubscribeUrl = `/status/${slug}/unsubscribe?sid=${encodeURIComponent(
          res.unsubscribe.sid
        )}&sig=${encodeURIComponent(res.unsubscribe.sig)}`;
        setSubscribeResult({
          kind: "success",
          message:
            "Webhook verification has been queued. We'll start sending updates once your endpoint responds successfully.",
          unsubscribeUrl,
        });
        return;
      }

      setSubscribeResult({
        kind: "success",
        message:
          "Check your inbox for a confirmation link to activate updates.",
      });
    } catch (err) {
      setSubscribeResult({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
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

          .status-maintenance {
            color: #3b82f6;
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
            color: ${brandColor};
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

          .overall-status.maintenance {
            background: rgba(59, 130, 246, 0.12);
            color: #1e40af;
          }

          .footer {
            text-align: center;
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 0.875rem;
          }

          .subscribe-button-inline {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            background: ${brandColor};
            color: white;
            border: 1px solid rgba(17, 24, 39, 0.15);
            border-radius: 9999px;
            padding: 0.65rem 1rem;
            font-weight: 700;
            cursor: pointer;
          }

          .status-header-actions {
            margin-top: 1rem;
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            align-items: center;
            justify-content: center;
          }

          .subscribe-button-inline:hover {
            opacity: 0.96;
          }

          .api-help-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            background: transparent;
            color: ${brandColor};
            border: 1px solid rgba(17, 24, 39, 0.15);
            border-radius: 9999px;
            padding: 0.65rem 1rem;
            font-weight: 700;
            cursor: pointer;
          }

          .api-help-button:hover {
            background: rgba(17, 24, 39, 0.04);
          }

          .api-help-note {
            font-size: 0.875rem;
            color: #6b7280;
            margin: 0 0 0.5rem 0;
          }

          .api-help-code {
            background: #0b1020;
            color: #e5e7eb;
            padding: 0.9rem;
            border-radius: 10px;
            overflow-x: auto;
            font-size: 0.875rem;
            line-height: 1.55;
            border: 1px solid rgba(229, 231, 235, 0.12);
            margin: 0.75rem 0;
          }

          .api-help-code code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
              "Liberation Mono", "Courier New", monospace;
          }

          .api-help-list {
            margin: 0;
            padding-left: 1rem;
            display: grid;
            gap: 0.75rem;
          }

          .api-help-list li {
            color: #374151;
          }

          .api-help-list strong {
            display: block;
            margin-bottom: 0.2rem;
          }

          .api-help-component-list {
            margin: 0;
            padding-left: 1rem;
            display: grid;
            gap: 0.35rem;
          }

          .api-help-component-list li {
            color: #374151;
            line-height: 1.4;
          }

          .api-help-component-list code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
              "Liberation Mono", "Courier New", monospace;
            background: #f3f4f6;
            border-radius: 4px;
            padding: 0.1rem 0.3rem;
          }

          .subscribe-form {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }

          .subscribe-row {
            display: grid;
            grid-template-columns: 160px 1fr;
            gap: 0.75rem;
            align-items: center;
          }

          .subscribe-label {
            font-size: 0.875rem;
            color: #374151;
            font-weight: 500;
          }

          .subscribe-input,
          .subscribe-select {
            width: 100%;
            padding: 0.6rem 0.75rem;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 0.95rem;
            outline: none;
          }

          .subscribe-input:focus,
          .subscribe-select:focus {
            border-color: ${brandColor};
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
          }

          .subscribe-actions {
            display: flex;
            gap: 0.75rem;
            align-items: center;
            justify-content: flex-end;
            margin-top: 0.5rem;
          }

          .subscribe-button {
            background: ${brandColor};
            color: white;
            border: none;
            border-radius: 6px;
            padding: 0.65rem 1rem;
            font-weight: 600;
            cursor: pointer;
          }

          .subscribe-button[disabled] {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .subscribe-help {
            font-size: 0.8125rem;
            color: #6b7280;
            margin: 0;
          }

          .subscribe-result {
            margin-top: 0.75rem;
            font-size: 0.875rem;
            padding: 0.75rem;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
            background: #f9fafb;
            color: #111827;
            overflow-wrap: anywhere;
          }

          .subscribe-result.error {
            border-color: #fecaca;
            background: #fef2f2;
            color: #991b1b;
          }

          .subscribe-result a {
            color: ${brandColor};
            text-decoration: none;
            font-weight: 600;
          }

          .subscribe-result a:hover {
            text-decoration: underline;
          }

          .powered-by {
            margin-top: 0.75rem;
            font-size: 0.8125rem;
          }

          .powered-by a {
            color: ${brandColor};
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

            .subscribe-row {
              grid-template-columns: 1fr;
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
          <div className="status-header-actions">
            <button
              type="button"
              className="subscribe-button-inline"
              onClick={() => {
                setSubscribeResult(null);
                setSubscribeEndpoint("");
                setSubscribeChannel("email");
                setSubscribeCadence("immediate");
                setIsSubscribeOpen(true);
              }}
            >
              Subscribe to updates
            </button>
            <button
              type="button"
              className="api-help-button"
              onClick={() => setIsApiHelpOpen(true)}
            >
              Availability API
            </button>
          </div>
        </div>

        <Modal
          isOpen={isApiHelpOpen}
          onClose={() => setIsApiHelpOpen(false)}
          title="Availability API"
        >
          <p className="api-help-note">
            These endpoints return availability based on incidents and
            maintenance windows. Times are UTC, and the examples use this page
            domain.
          </p>

          <ul className="api-help-list">
            <li>
              <strong>Overall daily uptime (JSON)</strong>
              <span className="api-help-note">
                Returns summary uptime plus daily buckets for the past 90 days.
              </span>
              <div className="api-help-code">
                <code>{`curl "${availabilityApiBase}/availability?days=90&bucket=day"`}</code>
              </div>
            </li>
            <li>
              <strong>Overall hourly uptime in a custom range (JSON)</strong>
              <span className="api-help-note">
                Use epoch seconds in UTC for high-resolution incident windows.
              </span>
              <div className="api-help-code">
                <code>{`curl "${availabilityApiBase}/availability?from=1735689600&to=1736294400&bucket=hour"`}</code>
              </div>
            </li>
            {exampleComponentId && (
              <li>
                <strong>Single component availability (JSON)</strong>
                <span className="api-help-note">
                  Filters results to one status page component using
                  `component_id`.
                </span>
                <div className="api-help-code">
                  <code>{`curl "${availabilityApiBase}/availability?component_id=${encodeURIComponent(exampleComponentId)}&days=30&bucket=day"`}</code>
                </div>
              </li>
            )}
            <li>
              <strong>Monthly report (CSV download)</strong>
              <span className="api-help-note">
                Returns daily rows for the month with uptime and downtime
                minutes.
              </span>
              <div className="api-help-code">
                <code>{`curl -L "${availabilityApiBase}/reports/availability/monthly?month=2026-01&format=csv" -o availability.csv`}</code>
              </div>
            </li>
          </ul>
          {components.length > 0 && (
            <>
              <p className="api-help-note">
                Component IDs on this status page (use with `component_id`):
              </p>
              <ul className="api-help-component-list">
                {components.map((component) => (
                  <li key={component.id}>
                    {component.name}: <code>{component.id}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>

        {components.length > 0 && (
          <>
            <div
              className={`overall-status ${
                components.some((c) => c.status === "down")
                  ? "degraded"
                  : components.some((c) => c.status === "maintenance")
                    ? "maintenance"
                    : "operational"
              }`}
            >
              {components.some((c) => c.status === "down")
                ? "Some systems are experiencing issues"
                : components.some((c) => c.status === "maintenance")
                  ? "Maintenance in progress"
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
              (c) => c.historical_data && c.historical_data.length > 0
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
                  <StatusBadge
                    status={
                      isStatusType(incident.status)
                        ? incident.status
                        : "unknown"
                    }
                  />
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
                  <StatusBadge
                    status={
                      isStatusType(incident.status)
                        ? incident.status
                        : "unknown"
                    }
                  />
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

        <Modal
          isOpen={isSubscribeOpen}
          onClose={() => setIsSubscribeOpen(false)}
          title="Subscribe to updates"
        >
          <p className="subscribe-help">
            Subscribe to incident updates for this status page.
          </p>

          <form className="subscribe-form" onSubmit={onSubscribe}>
            <div className="subscribe-row">
              <label className="subscribe-label" htmlFor="subscribe-channel">
                Delivery
              </label>
              <select
                id="subscribe-channel"
                className="subscribe-select"
                value={subscribeChannel}
                onChange={(e) =>
                  setSubscribeChannel(
                    e.target.value === "webhook" ? "webhook" : "email"
                  )
                }
              >
                <option value="email">Email</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>

            <div className="subscribe-row">
              <label className="subscribe-label" htmlFor="subscribe-cadence">
                Cadence
              </label>
              <select
                id="subscribe-cadence"
                className="subscribe-select"
                value={subscribeCadence}
                onChange={(e) =>
                  setSubscribeCadence(
                    e.target.value === "daily"
                      ? "daily"
                      : e.target.value === "weekly"
                        ? "weekly"
                        : "immediate"
                  )
                }
              >
                <option value="immediate">Immediate</option>
                <option value="daily">Daily digest</option>
                <option value="weekly">Weekly digest</option>
              </select>
            </div>

            <div className="subscribe-row">
              <label className="subscribe-label" htmlFor="subscribe-endpoint">
                {subscribeChannel === "email" ? "Email" : "Webhook URL"}
              </label>
              <input
                id="subscribe-endpoint"
                className="subscribe-input"
                type={subscribeChannel === "email" ? "email" : "url"}
                value={subscribeEndpoint}
                onChange={(e) => setSubscribeEndpoint(e.target.value)}
                placeholder={
                  subscribeChannel === "email"
                    ? "you@example.com"
                    : "https://example.com/webhook"
                }
                required
              />
            </div>

            <div className="subscribe-actions">
              <button
                type="submit"
                className="subscribe-button"
                disabled={subscribeResult?.kind === "working"}
              >
                {subscribeResult?.kind === "working"
                  ? "Submitting…"
                  : "Subscribe"}
              </button>
            </div>
          </form>

          {subscribeResult?.kind === "success" && (
            <div className="subscribe-result">
              <div>{subscribeResult.message}</div>
              {subscribeResult.unsubscribeUrl && (
                <div style={{ marginTop: "0.5rem" }}>
                  <a href={subscribeResult.unsubscribeUrl}>Unsubscribe</a>
                </div>
              )}
            </div>
          )}

          {subscribeResult?.kind === "error" && (
            <div className="subscribe-result error">
              {subscribeResult.message}
            </div>
          )}
        </Modal>

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
