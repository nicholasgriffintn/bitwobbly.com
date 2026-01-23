import { useState, useEffect, type FormEvent } from 'react';

import { apiFetch } from '../lib/api';
import { useAuthToken } from '../lib/auth';

type Monitor = {
  id: string;
  name: string;
  url: string;
  interval_seconds: number;
  timeout_ms: number;
  failure_threshold: number;
  state?: { last_status?: string; last_latency_ms?: number | null } | null;
};

export default function Monitors() {
  const token = useAuthToken();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [interval, setInterval] = useState('60');
  const [timeout, setTimeout] = useState('8000');
  const [threshold, setThreshold] = useState('3');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch<{ monitors: Monitor[] }>('/api/monitors', {
          token,
        });
        if (cancelled) return;
        setMonitors(res.monitors || []);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/monitors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          url,
          interval_seconds: Number(interval),
          timeout_ms: Number(timeout),
          failure_threshold: Number(threshold),
        }),
        token,
      });
      const res = await apiFetch<{ monitors: Monitor[] }>('/api/monitors', {
        token,
      });
      setMonitors(res.monitors || []);
      setName('');
      setUrl('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/monitors/${id}`, { method: 'DELETE', token });
      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError((err as Error).message);
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
            <div></div>
          </div>
          {loading ? (
            <div className="table-row">
              <div className="muted">Loading monitors...</div>
            </div>
          ) : monitors.length ? (
            monitors.map((monitor) => (
              <div key={monitor.id} className="table-row">
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
                    onClick={() => onDelete(monitor.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
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
