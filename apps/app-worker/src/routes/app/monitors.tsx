import React, { useState, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';

import { MetricsChart } from '@/components/MetricsChart';
import {
  listMonitorsFn,
  createMonitorFn,
  deleteMonitorFn
} from '@/server/functions/monitors';

type Monitor = {
  id: string;
  name: string;
  url: string;
  interval_seconds: number;
  timeout_ms: number;
  failure_threshold: number;
  state?: { last_status?: string; last_latency_ms?: number | null } | null;
};

export const Route = createFileRoute('/app/monitors')({
  component: Monitors,
  loader: async () => {
    const monitors = await listMonitorsFn();
    return { monitors: monitors.monitors };
  }
});

function Monitors() {
  const { monitors: initialMonitors } = Route.useLoaderData();

  const [monitors, setMonitors] = useState<Monitor[]>(initialMonitors);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [interval, setInterval] = useState('60');
  const [timeout, setTimeout] = useState('8000');
  const [threshold, setThreshold] = useState('3');
  const [expandedMonitorId, setExpandedMonitorId] = useState<string | null>(
    null,
  );

  const createMonitor = useServerFn(createMonitorFn);
  const deleteMonitor = useServerFn(deleteMonitorFn);
  const listMonitors = useServerFn(listMonitorsFn);

  const refreshMonitors = async () => {
    try {
      const res = await listMonitors();
      setMonitors(res.monitors);
    } catch (err) {
      setError(err.message);
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
        }
      });
      await refreshMonitors();
      setName('');
      setUrl('');
    } catch (err) {
      setError(err.message);
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteMonitor({ data: { id } });
      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
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
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="monitor-timeout">Timeout (ms)</label>
              <input
                id="monitor-timeout"
                value={timeout}
                onChange={(event) => setTimeout(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="monitor-threshold">Failure threshold</label>
              <input
                id="monitor-threshold"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
              />
            </div>
          </div>
          <button type="submit">Save monitor</button>
        </form>
      </div>

      <div className="card">
        <div className="table">
          <div className="table-row header">
            <div>Name</div>
            <div>Status</div>
            <div>Interval</div>
            <div>Timeout</div>
            <div>Threshold</div>
            <div>Actions</div>
          </div>
          {monitors.length ? (
            monitors.map((monitor) => (
              <React.Fragment key={monitor.id}>
                <div className="table-row">
                  <div>
                    <div className="list-title">{monitor.name}</div>
                    <div className="muted">{monitor.url}</div>
                  </div>
                  <div>
                    <span
                      className={`status ${monitor.state?.last_status || 'unknown'}`}
                    >
                      {monitor.state?.last_status || 'unknown'}
                    </span>
                  </div>
                  <div>{monitor.interval_seconds}s</div>
                  <div>{monitor.timeout_ms}ms</div>
                  <div>{monitor.failure_threshold}</div>
                  <div>
                    <button
                      type="button"
                      className="outline"
                      onClick={() =>
                        setExpandedMonitorId(
                          expandedMonitorId === monitor.id ? null : monitor.id,
                        )
                      }
                    >
                      {expandedMonitorId === monitor.id ? 'Hide' : 'Show'}{' '}
                      Metrics
                    </button>
                    <button
                      type="button"
                      className="outline"
                      style={{ marginLeft: '0.5rem' }}
                      onClick={() => onDelete(monitor.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {expandedMonitorId === monitor.id && (
                  <div className="table-row">
                    <div style={{ gridColumn: '1 / -1', padding: 0 }}>
                      <MetricsChart monitorId={monitor.id} />
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))
          ) : (
            <div className="table-row">
              <div className="muted">No monitors configured.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
