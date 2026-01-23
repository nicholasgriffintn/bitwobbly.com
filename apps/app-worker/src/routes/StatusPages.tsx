import { useState, useEffect, type FormEvent } from 'react';

import { apiFetch } from '../lib/api';
import { useAuthToken } from '../lib/auth';

type StatusPage = {
  id: string;
  name: string;
  slug: string;
};

export default function StatusPages() {
  const token = useAuthToken();
  const [pages, setPages] = useState<StatusPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiFetch<{ status_pages: StatusPage[] }>(
          '/api/status-pages',
          { token },
        );
        if (cancelled) return;
        setPages(res.status_pages || []);
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
      await apiFetch('/api/status-pages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug }),
        token,
      });
      const res = await apiFetch<{ status_pages: StatusPage[] }>(
        '/api/status-pages',
        { token },
      );
      setPages(res.status_pages || []);
      setName('');
      setSlug('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`/api/status-pages/${id}`, { method: 'DELETE', token });
      setPages((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Status pages</h2>
          <p>Publish uptime updates for your customers.</p>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div className="card-title">Create status page</div>
        <form className="form" onSubmit={onCreate}>
          <label htmlFor="status-name">Name</label>
          <input
            id="status-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Customer status"
            required
          />
          <label htmlFor="status-slug">Slug</label>
          <input
            id="status-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="status"
            required
          />
          <button type="submit">Save status page</button>
        </form>
      </div>

      <div className="grid two">
        {loading ? (
          <div className="card">Loading status pages...</div>
        ) : pages.length ? (
          pages.map((page) => (
            <div key={page.id} className="card">
              <div className="card-title">{page.name}</div>
              <div className="muted">/{page.slug}</div>
              <div className="card-actions">
                <button type="button" className="outline">
                  View public page
                </button>
                <button
                  type="button"
                  className="outline"
                  onClick={() => onDelete(page.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="card">No status pages yet.</div>
        )}
      </div>
    </div>
  );
}
