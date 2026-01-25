import React, { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { MetricsChart } from "@/components/MetricsChart";
import { Modal } from "@/components/Modal";
import {
  listMonitorsFn,
  createMonitorFn,
  deleteMonitorFn,
  updateMonitorFn,
  triggerSchedulerFn,
  setManualMonitorStatusFn,
} from "@/server/functions/monitors";

type MonitorType = "http" | "webhook" | "external" | "manual";

type Monitor = {
  id: string;
  name: string;
  url: string;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  enabled: number;
  type: MonitorType;
  webhookToken?: string | null;
  externalConfig?: string | null;
  state?: { lastStatus?: string; lastLatencyMs?: number | null } | null;
};

export const Route = createFileRoute("/app/monitors")({
  component: Monitors,
  loader: async () => {
    const monitors = await listMonitorsFn();
    return { monitors: monitors.monitors };
  },
});

function Monitors() {
  const { monitors: initialMonitors } = Route.useLoaderData();

  const [monitors, setMonitors] = useState<Monitor[]>(initialMonitors);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [interval, setInterval] = useState("60");
  const [timeout, setTimeout] = useState("8000");
  const [threshold, setThreshold] = useState("3");
  const [monitorType, setMonitorType] = useState<MonitorType>("http");
  const [externalServiceType, setExternalServiceType] = useState("");
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [createdMonitorId, setCreatedMonitorId] = useState<string | null>(null);
  const [expandedMonitorId, setExpandedMonitorId] = useState<string | null>(
    null,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMonitorId, setEditingMonitorId] = useState<string | null>(null);
  const [editingMonitorType, setEditingMonitorType] =
    useState<MonitorType>("http");
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editInterval, setEditInterval] = useState("");
  const [editTimeout, setEditTimeout] = useState("");
  const [editThreshold, setEditThreshold] = useState("");
  const [editExternalServiceType, setEditExternalServiceType] = useState("");
  const [isManualStatusModalOpen, setIsManualStatusModalOpen] = useState(false);
  const [manualStatusMonitorId, setManualStatusMonitorId] = useState<
    string | null
  >(null);
  const [manualStatus, setManualStatus] = useState<"up" | "down" | "degraded">(
    "up",
  );
  const [manualMessage, setManualMessage] = useState("");

  const createMonitor = useServerFn(createMonitorFn);
  const deleteMonitor = useServerFn(deleteMonitorFn);
  const updateMonitor = useServerFn(updateMonitorFn);
  const listMonitors = useServerFn(listMonitorsFn);
  const triggerScheduler = useServerFn(triggerSchedulerFn);
  const setManualMonitorStatus = useServerFn(setManualMonitorStatusFn);

  const refreshMonitors = async () => {
    try {
      const res = await listMonitors();
      setMonitors(res.monitors);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const externalConfig =
        monitorType === "external" && externalServiceType
          ? JSON.stringify({ serviceType: externalServiceType })
          : undefined;

      const result = await createMonitor({
        data: {
          name,
          url: url || undefined,
          interval_seconds: Number(interval),
          timeout_ms: Number(timeout),
          failure_threshold: Number(threshold),
          type: monitorType,
          external_config: externalConfig,
        },
      });

      if (result.webhookToken) {
        setWebhookToken(result.webhookToken);
        setCreatedMonitorId(result.id);
      } else {
        await refreshMonitors();
        closeCreateModal();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setWebhookToken(null);
    setCreatedMonitorId(null);
    setName("");
    setUrl("");
    setInterval("60");
    setTimeout("8000");
    setThreshold("3");
    setMonitorType("http");
    setExternalServiceType("");
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteMonitor({ data: { id } });
      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startEditing = (monitor: Monitor) => {
    setEditingMonitorId(monitor.id);
    setEditingMonitorType(monitor.type);
    setEditName(monitor.name);
    setEditUrl(monitor.url || "");
    setEditInterval(String(monitor.intervalSeconds));
    setEditTimeout(String(monitor.timeoutMs));
    setEditThreshold(String(monitor.failureThreshold));
    if (monitor.externalConfig) {
      try {
        const config = JSON.parse(monitor.externalConfig);
        setEditExternalServiceType(config.serviceType || "");
      } catch {
        setEditExternalServiceType("");
      }
    }
    setIsEditModalOpen(true);
  };

  const cancelEditing = () => {
    setEditingMonitorId(null);
    setIsEditModalOpen(false);
  };

  const onUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingMonitorId) return;
    setError(null);
    try {
      const externalConfig =
        editingMonitorType === "external" && editExternalServiceType
          ? JSON.stringify({ serviceType: editExternalServiceType })
          : undefined;

      await updateMonitor({
        data: {
          id: editingMonitorId,
          name: editName,
          url: editUrl || undefined,
          interval_seconds: Number(editInterval),
          timeout_ms: Number(editTimeout),
          failure_threshold: Number(editThreshold),
          type: editingMonitorType,
          external_config: externalConfig,
        },
      });
      await refreshMonitors();
      setEditingMonitorId(null);
      setIsEditModalOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openManualStatusModal = (monitorId: string) => {
    setManualStatusMonitorId(monitorId);
    setManualStatus("up");
    setManualMessage("");
    setIsManualStatusModalOpen(true);
  };

  const onSetManualStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!manualStatusMonitorId) return;
    setError(null);
    try {
      await setManualMonitorStatus({
        data: {
          monitorId: manualStatusMonitorId,
          status: manualStatus,
          message: manualMessage || undefined,
        },
      });
      await refreshMonitors();
      setIsManualStatusModalOpen(false);
      setManualStatusMonitorId(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleEnabled = async (monitor: Monitor) => {
    setError(null);
    try {
      await updateMonitor({
        data: {
          id: monitor.id,
          enabled: monitor.enabled ? 0 : 1,
        },
      });
      await refreshMonitors();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onTriggerScheduler = async () => {
    setError(null);
    try {
      await triggerScheduler();
      window.setTimeout(refreshMonitors, 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page">
      <div className="page-header mb-6">
        <div>
          <h2>Monitors</h2>
          <p>Track availability, latency, and incident thresholds.</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)}>
          Create Monitor
        </button>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div
          className="card-title"
          style={{ display: "flex", alignItems: "center", gap: "1rem" }}
        >
          Monitors
          <button
            type="button"
            className="outline"
            onClick={onTriggerScheduler}
            title="Manually trigger monitor checks (dev mode)"
            style={{
              marginLeft: "auto",
              fontSize: "0.875rem",
              padding: "0.25rem 0.75rem",
            }}
          >
            Check Now
          </button>
        </div>
        <div className="list">
          {monitors.length ? (
            monitors.map((monitor) => (
              <React.Fragment key={monitor.id}>
                <div className="list-item-expanded">
                  <div className="list-row">
                    <div style={{ flex: 1 }}>
                      <div className="list-title">
                        {monitor.name}
                        {!monitor.enabled && (
                          <span
                            className="pill small"
                            style={{ marginLeft: "0.5rem" }}
                          >
                            paused
                          </span>
                        )}
                      </div>
                      {monitor.url && (
                        <div className="muted">{monitor.url}</div>
                      )}
                      <div className="muted" style={{ marginTop: "0.25rem" }}>
                        <span
                          className={`status ${monitor.state?.lastStatus || "unknown"}`}
                        >
                          {monitor.state?.lastStatus || "unknown"}
                        </span>
                        {" · "}
                        <span className="pill small">{monitor.type}</span>
                        {(monitor.type === "http" ||
                          monitor.type === "external") && (
                          <>
                            {" · "}
                            {monitor.intervalSeconds}s interval ·{" "}
                            {monitor.timeoutMs}ms timeout ·{" "}
                            {monitor.failureThreshold} failures
                          </>
                        )}
                      </div>
                    </div>
                    <div className="button-row">
                      {(monitor.type === "http" ||
                        monitor.type === "external") && (
                        <button
                          type="button"
                          className="outline"
                          onClick={() =>
                            setExpandedMonitorId(
                              expandedMonitorId === monitor.id
                                ? null
                                : monitor.id,
                            )
                          }
                        >
                          {expandedMonitorId === monitor.id
                            ? "Hide"
                            : "Metrics"}
                        </button>
                      )}
                      {monitor.type === "manual" && (
                        <button
                          type="button"
                          className="outline"
                          onClick={() => openManualStatusModal(monitor.id)}
                        >
                          Set Status
                        </button>
                      )}
                      <button
                        type="button"
                        className="outline"
                        onClick={() => startEditing(monitor)}
                      >
                        Edit
                      </button>
                      {(monitor.type === "http" ||
                        monitor.type === "external") && (
                        <button
                          type="button"
                          className="outline"
                          onClick={() => toggleEnabled(monitor)}
                        >
                          {monitor.enabled ? "Pause" : "Resume"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="outline"
                        onClick={() => onDelete(monitor.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {expandedMonitorId === monitor.id && (
                    <div style={{ marginTop: "1rem" }}>
                      <MetricsChart monitorId={monitor.id} />
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))
          ) : (
            <div className="muted">No monitors configured.</div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        title="Create Monitor"
      >
        {webhookToken ? (
          <div className="form">
            <div
              style={{
                padding: "1rem",
                marginBottom: "1rem",
                backgroundColor: "#f8f9fa",
                borderRadius: "4px",
                border: "2px solid #28a745",
              }}
            >
              <div
                style={{
                  marginBottom: "0.75rem",
                  color: "#28a745",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "1rem",
                  fontWeight: 600,
                }}
              >
                <span>✓</span>
                Webhook Monitor Created
              </div>
              <p
                style={{
                  margin: "0 0 1rem 0",
                  padding: "0.5rem",
                  backgroundColor: "#fff3cd",
                  border: "1px solid #ffc107",
                  borderRadius: "4px",
                  color: "#856404",
                  fontSize: "0.875rem",
                }}
              >
                <strong>⚠️</strong> Save this webhook URL and token securely.
                You will not be able to see it again.
              </p>

              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  Webhook URL
                </label>
                <input
                  readOnly
                  value={`${window.location.origin}/api/webhooks/${createdMonitorId}`}
                  onClick={(e) => e.currentTarget.select()}
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    width: "100%",
                  }}
                />
              </div>

              <div>
                <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  Token
                </label>
                <input
                  readOnly
                  value={webhookToken}
                  onClick={(e) => e.currentTarget.select()}
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    width: "100%",
                  }}
                />
                <p
                  className="muted"
                  style={{ margin: "0.5rem 0 0 0", fontSize: "0.75rem" }}
                >
                  POST to the URL with JSON:{" "}
                  {`{ "token": "...", "status": "up|down|degraded", "message": "..." }`}
                </p>
              </div>
            </div>
            <div className="button-row">
              <button
                type="button"
                onClick={async () => {
                  await refreshMonitors();
                  closeCreateModal();
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={onCreate}>
            <label htmlFor="monitor-type">Monitor Type</label>
            <select
              id="monitor-type"
              value={monitorType}
              onChange={(e) => setMonitorType(e.target.value as MonitorType)}
            >
              <option value="http">HTTP</option>
              <option value="webhook">Webhook</option>
              <option value="external">External Service</option>
              <option value="manual">Manual</option>
            </select>

            <label htmlFor="monitor-name">Name</label>
            <input
              id="monitor-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="API gateway"
              required
            />

            {monitorType === "http" && (
              <>
                <label htmlFor="monitor-url">URL</label>
                <input
                  id="monitor-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com/health"
                  required
                />
              </>
            )}

            {monitorType === "webhook" && (
              <p className="muted">
                A webhook token will be generated. External services will push
                status updates to your webhook endpoint.
              </p>
            )}

            {monitorType === "external" && (
              <>
                <label htmlFor="monitor-url">Status URL</label>
                <input
                  id="monitor-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://status.example.com/api"
                  required
                />
              </>
            )}

            {monitorType === "external" && (
              <>
                <label htmlFor="external-service">Service Type</label>
                <select
                  id="external-service"
                  value={externalServiceType}
                  onChange={(e) => setExternalServiceType(e.target.value)}
                  required
                >
                  <option value="">Select a service...</option>
                  <option value="cloudflare-workers">Cloudflare Workers</option>
                  <option value="cloudflare-d1">Cloudflare D1</option>
                  <option value="cloudflare-r2">Cloudflare R2</option>
                  <option value="cloudflare-kv">Cloudflare KV</option>
                  <option value="custom">Custom Status Page</option>
                </select>
              </>
            )}

            {monitorType === "manual" && (
              <p className="muted">
                Manual monitors require you to set the status manually from the
                monitor list.
              </p>
            )}

            {monitorType !== "webhook" && monitorType !== "manual" && (
              <div className="grid three">
                <div>
                  <label htmlFor="monitor-interval">Interval (sec)</label>
                  <input
                    id="monitor-interval"
                    type="number"
                    min="30"
                    max="3600"
                    value={interval}
                    onChange={(event) => setInterval(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="monitor-timeout">Timeout (ms)</label>
                  <input
                    id="monitor-timeout"
                    type="number"
                    min="1000"
                    max="30000"
                    value={timeout}
                    onChange={(event) => setTimeout(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="monitor-threshold">Failure threshold</label>
                  <input
                    id="monitor-threshold"
                    type="number"
                    min="1"
                    max="10"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="button-row" style={{ marginTop: "1rem" }}>
              <button type="submit">Create Monitor</button>
              <button
                type="button"
                className="outline"
                onClick={closeCreateModal}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={cancelEditing}
        title="Edit Monitor"
      >
        <form className="form" onSubmit={onUpdate}>
          <label htmlFor="edit-name">Name</label>
          <input
            id="edit-name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />

          {(editingMonitorType === "http" ||
            editingMonitorType === "external") && (
            <>
              <label htmlFor="edit-url">URL</label>
              <input
                id="edit-url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                required
              />
            </>
          )}

          {editingMonitorType === "external" && (
            <>
              <label htmlFor="edit-external-service">Service Type</label>
              <select
                id="edit-external-service"
                value={editExternalServiceType}
                onChange={(e) => setEditExternalServiceType(e.target.value)}
              >
                <option value="">Select a service...</option>
                <option value="cloudflare-workers">Cloudflare Workers</option>
                <option value="cloudflare-d1">Cloudflare D1</option>
                <option value="cloudflare-r2">Cloudflare R2</option>
                <option value="cloudflare-kv">Cloudflare KV</option>
                <option value="custom">Custom Status Page</option>
              </select>
            </>
          )}

          {editingMonitorType !== "webhook" &&
            editingMonitorType !== "manual" && (
              <div className="grid three">
                <div>
                  <label htmlFor="edit-interval">Interval (sec)</label>
                  <input
                    id="edit-interval"
                    type="number"
                    min="30"
                    max="3600"
                    value={editInterval}
                    onChange={(e) => setEditInterval(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="edit-timeout">Timeout (ms)</label>
                  <input
                    id="edit-timeout"
                    type="number"
                    min="1000"
                    max="30000"
                    value={editTimeout}
                    onChange={(e) => setEditTimeout(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="edit-threshold">Failure threshold</label>
                  <input
                    id="edit-threshold"
                    type="number"
                    min="1"
                    max="10"
                    value={editThreshold}
                    onChange={(e) => setEditThreshold(e.target.value)}
                  />
                </div>
              </div>
            )}

          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="submit">Save Changes</button>
            <button type="button" className="outline" onClick={cancelEditing}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isManualStatusModalOpen}
        onClose={() => setIsManualStatusModalOpen(false)}
        title="Set Manual Status"
      >
        <form className="form" onSubmit={onSetManualStatus}>
          <label htmlFor="manual-status">Status</label>
          <select
            id="manual-status"
            value={manualStatus}
            onChange={(e) =>
              setManualStatus(e.target.value as "up" | "down" | "degraded")
            }
          >
            <option value="up">Up</option>
            <option value="down">Down</option>
            <option value="degraded">Degraded</option>
          </select>

          <label htmlFor="manual-message">Message (optional)</label>
          <input
            id="manual-message"
            value={manualMessage}
            onChange={(e) => setManualMessage(e.target.value)}
            placeholder="Optional status message"
          />

          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="submit">Update Status</button>
            <button
              type="button"
              className="outline"
              onClick={() => setIsManualStatusModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
