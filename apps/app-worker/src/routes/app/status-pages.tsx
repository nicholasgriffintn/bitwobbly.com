import { useState, useEffect, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';

import { apiFetch } from '@/lib/api';
import { useAuthToken } from '@/lib/auth';

type StatusPage = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  brand_color?: string;
  custom_css?: string;
};

export const Route = createFileRoute('/app/status-pages')({
  component: StatusPages,
});

export default function StatusPages() {
  const token = useAuthToken();
  const [pages, setPages] = useState<StatusPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#007bff');
  const [customCss, setCustomCss] = useState('');

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
        if (!cancelled) {
          setLoading(false);
        }
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
        body: JSON.stringify({
          name,
          slug,
          logo_url: logoUrl.trim() || null,
          brand_color: brandColor.trim() || '#007bff',
          custom_css: customCss.trim() || null,
        }),
        token,
      });
      const res = await apiFetch<{ status_pages: StatusPage[] }>(
        '/api/status-pages',
        {
          token,
        },
      );
      setPages(res.status_pages || []);
      setName('');
      setSlug('');
      setLogoUrl('');
      setBrandColor('#007bff');
      setCustomCss('');
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

          <div className="card-subtitle">Customization (optional)</div>

          <label htmlFor="logo-url">Logo URL</label>
          <input
            id="logo-url"
            type="url"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://example.com/logo.png"
          />

          <label htmlFor="brand-color">Brand Color</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              id="brand-color"
              type="color"
              value={brandColor}
              onChange={(event) => setBrandColor(event.target.value)}
              style={{
                height: '2rem',
                width: '4rem',
                padding: '0',
                border: 'none',
                borderRadius: '4px',
              }}
            />
            <input
              type="text"
              value={brandColor}
              onChange={(event) => setBrandColor(event.target.value)}
              placeholder="#007bff"
              style={{ flex: 1 }}
            />
          </div>

          <label htmlFor="custom-css">Custom CSS</label>
          <textarea
            id="custom-css"
            value={customCss}
            onChange={(event) => setCustomCss(event.target.value)}
            placeholder=".status-page { background: #f8f9fa; }"
            rows={4}
            style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
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
