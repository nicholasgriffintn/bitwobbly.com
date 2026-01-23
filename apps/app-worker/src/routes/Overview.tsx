import { useState, useEffect, type FormEvent } from 'react';

import { apiFetch } from '../lib/api';
import { useAuthToken } from '../lib/auth';

type Monitor = {
  id: string;
  name: string;
  url: string;
  state?: { last_status?: string; last_latency_ms?: number | null } | null;
};

type StatusPage = {
  id: string;
  name: string;
  slug: string;
};

export default function Overview() {
  const token = useAuthToken();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [pages, setPages] = useState<StatusPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [monitorsRes, pagesRes] = await Promise.all([
          apiFetch<{ monitors: Monitor[] }>('/api/monitors', { token }),
          apiFetch<{ status_pages: StatusPage[] }>('/api/status-pages', {
            token,
          }),
        ]);
        if (cancelled) return;
        setMonitors(monitorsRes.monitors || []);
        setPages(pagesRes.status_pages || []);
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
