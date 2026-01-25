import React, { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { MetricsChart } from "@/components/MetricsChart";
import {
  listMonitorsFn,
  createMonitorFn,
  deleteMonitorFn,
  updateMonitorFn,
} from "@/server/functions/monitors";

type Monitor = {
  id: string;
  name: string;
  url: string;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  enabled: number;
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
  const [expandedMonitorId, setExpandedMonitorId] = useState<string | null>(
    null,
  );
  const [editingMonitorId, setEditingMonitorId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editInterval, setEditInterval] = useState("");
  const [editTimeout, setEditTimeout] = useState("");
  const [editThreshold, setEditThreshold] = useState("");

  const createMonitor = useServerFn(createMonitorFn);
  const deleteMonitor = useServerFn(deleteMonitorFn);
  const updateMonitor = useServerFn(updateMonitorFn);
  const listMonitors = useServerFn(listMonitorsFn);

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
      await createMonitor({
        data: {
          name,
          url,
          interval_seconds: Number(interval),
          timeout_ms: Number(timeout),
          failure_threshold: Number(threshold),
        },
      });
      await refreshMonitors();
      setName("");
      setUrl("");
    } catch (err) {
      setError((err as Error).message);
    }
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
    setEditName(monitor.name);
    setEditUrl(monitor.url);
    setEditInterval(String(monitor.intervalSeconds));
    setEditTimeout(String(monitor.timeoutMs));
    setEditThreshold(String(monitor.failureThreshold));
  };

  const cancelEditing = () => {
    setEditingMonitorId(null);
  };

  const onUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingMonitorId) return;
    setError(null);
    try {
      await updateMonitor({
        data: {
          id: editingMonitorId,
          name: editName,
          url: editUrl,
          interval_seconds: Number(editInterval),
          timeout_ms: Number(editTimeout),
          failure_threshold: Number(editThreshold),
        },
      });
      await refreshMonitors();
      setEditingMonitorId(null);
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

  return (
    <div className="page">
      <div className="page-header mb-6">
        <div>
          <h2>Monitors</h2>
          <p>Track availability, latency, and incident thresholds.</p>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div className="card-title">Create monitor</div>
        <form className="form" onSubmit={onCreate}>
          <label htmlFor="monitor-name">Name</label>
          <input
            id="monitor-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="API gateway"
            required
          />
          <label htmlFor="monitor-url">URL</label>
          <input
            id="monitor-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/health"
            required
          />
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
          <button type="submit">Save monitor</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Monitors</div>
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
                      <div className="muted">{monitor.url}</div>
                      <div className="muted" style={{ marginTop: "0.25rem" }}>
                        <span
                          className={`status ${monitor.state?.lastStatus || "unknown"}`}
                        >
                          {monitor.state?.lastStatus || "unknown"}
                        </span>
                        {" · "}
                        {monitor.intervalSeconds}s interval ·{" "}
                        {monitor.timeoutMs}
                        ms timeout · {monitor.failureThreshold} failures
                      </div>
                    </div>
                    <div className="button-row">
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
                        {expandedMonitorId === monitor.id ? "Hide" : "Metrics"}
                      </button>
                      <button
                        type="button"
                        className="outline"
                        onClick={() => startEditing(monitor)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="outline"
                        onClick={() => toggleEnabled(monitor)}
                      >
                        {monitor.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        className="outline"
                        onClick={() => onDelete(monitor.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {editingMonitorId === monitor.id && (
                    <div className="nested-form">
                      <form className="form" onSubmit={onUpdate}>
                        <div className="grid two">
                          <div>
                            <label htmlFor={`edit-name-${monitor.id}`}>
                              Name
                            </label>
                            <input
                              id={`edit-name-${monitor.id}`}
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label htmlFor={`edit-url-${monitor.id}`}>
                              URL
                            </label>
                            <input
                              id={`edit-url-${monitor.id}`}
                              value={editUrl}
                              onChange={(e) => setEditUrl(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <div className="grid three">
                          <div>
                            <label htmlFor={`edit-interval-${monitor.id}`}>
                              Interval (sec)
                            </label>
                            <input
                              id={`edit-interval-${monitor.id}`}
                              type="number"
                              min="30"
                              max="3600"
                              value={editInterval}
                              onChange={(e) => setEditInterval(e.target.value)}
                            />
                          </div>
                          <div>
                            <label htmlFor={`edit-timeout-${monitor.id}`}>
                              Timeout (ms)
                            </label>
                            <input
                              id={`edit-timeout-${monitor.id}`}
                              type="number"
                              min="1000"
                              max="30000"
                              value={editTimeout}
                              onChange={(e) => setEditTimeout(e.target.value)}
                            />
                          </div>
                          <div>
                            <label htmlFor={`edit-threshold-${monitor.id}`}>
                              Failure threshold
                            </label>
                            <input
                              id={`edit-threshold-${monitor.id}`}
                              type="number"
                              min="1"
                              max="10"
                              value={editThreshold}
                              onChange={(e) => setEditThreshold(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="button-row">
                          <button type="submit">Save changes</button>
                          <button
                            type="button"
                            className="outline"
                            onClick={cancelEditing}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

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
    </div>
  );
}
