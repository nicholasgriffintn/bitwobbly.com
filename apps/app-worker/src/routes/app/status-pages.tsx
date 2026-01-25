import { useState, useEffect, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import {
  listStatusPagesFn,
  createStatusPageFn,
  deleteStatusPageFn,
} from "@/server/functions/status-pages";
import {
  listComponentsFn,
  linkToPageFn,
  unlinkFromPageFn,
  getPageComponentsFn,
} from "@/server/functions/components";

type StatusPage = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  brand_color?: string;
  custom_css?: string;
};

type Component = {
  id: string;
  name: string;
};

type PageComponent = {
  componentId: string;
  name: string;
  sortOrder: number;
};

export const Route = createFileRoute("/app/status-pages")({
  component: StatusPages,
  loader: async () => {
    const [pagesRes, componentsRes] = await Promise.all([
      listStatusPagesFn(),
      listComponentsFn(),
    ]);
    return {
      status_pages: pagesRes.status_pages,
      components: componentsRes.components,
    };
  },
});

export default function StatusPages() {
  const { status_pages: initialPages, components: initialComponents } =
    Route.useLoaderData();
  const [pages, setPages] = useState<StatusPage[]>(initialPages);
  const [components] = useState<Component[]>(initialComponents);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#007bff");
  const [customCss, setCustomCss] = useState("");

  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);
  const [pageComponents, setPageComponents] = useState<PageComponent[]>([]);

  const createStatusPage = useServerFn(createStatusPageFn);
  const deleteStatusPage = useServerFn(deleteStatusPageFn);
  const listStatusPages = useServerFn(listStatusPagesFn);
  const linkToPage = useServerFn(linkToPageFn);
  const unlinkFromPage = useServerFn(unlinkFromPageFn);
  const getPageComponents = useServerFn(getPageComponentsFn);

  const refreshPages = async () => {
    try {
      const res = await listStatusPages();
      setPages(res.status_pages);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadPageComponents = async (pageId: string) => {
    try {
      const res = await getPageComponents({ data: { statusPageId: pageId } });
      setPageComponents(res.components);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    if (expandedPageId) {
      loadPageComponents(expandedPageId);
    }
  }, [expandedPageId]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createStatusPage({
        data: {
          name,
          slug,
          logo_url: logoUrl.trim() || undefined,
          brand_color: brandColor.trim() || "#007bff",
          custom_css: customCss.trim() || undefined,
        },
      });
      await refreshPages();
      setName("");
      setSlug("");
      setLogoUrl("");
      setBrandColor("#007bff");
      setCustomCss("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteStatusPage({ data: { id } });
      setPages((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onToggleComponent = async (
    pageId: string,
    componentId: string,
    linked: boolean,
  ) => {
    setError(null);
    try {
      if (linked) {
        await unlinkFromPage({ data: { statusPageId: pageId, componentId } });
      } else {
        await linkToPage({
          data: { statusPageId: pageId, componentId, sortOrder: 0 },
        });
      }
      await loadPageComponents(pageId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openPublicPage = (slug: string) => {
    window.open(`/status/${slug}`, "_blank");
  };

  return (
    <div className="page">
      <div className="page-header mb-6">
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

      <div className="card">
        <div className="card-title">Status pages</div>
        <div className="list">
          {pages.length ? (
            pages.map((page) => {
              const isExpanded = expandedPageId === page.id;
              const linkedComponentIds = pageComponents.map(
                (pc) => pc.componentId,
              );

              return (
                <div key={page.id} className="list-item-expanded">
                  <div className="list-row">
                    <div>
                      <div className="list-title">{page.name}</div>
                      <div className="muted">/{page.slug}</div>
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="outline"
                        onClick={() => openPublicPage(page.slug)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="outline"
                        onClick={() =>
                          setExpandedPageId(isExpanded ? null : page.id)
                        }
                      >
                        {isExpanded ? 'Hide' : 'Components'}
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

                  {isExpanded && (
                    <div className="nested-list">
                      <div className="muted" style={{ marginBottom: '0.5rem' }}>
                        Link components to display on this status page:
                      </div>
                      {components.length ? (
                        components.map((component) => {
                          const linked = linkedComponentIds.includes(
                            component.id,
                          );
                          return (
                            <label key={component.id} className="checkbox-row">
                              <input
                                type="checkbox"
                                checked={linked}
                                onChange={() =>
                                  onToggleComponent(
                                    page.id,
                                    component.id,
                                    linked,
                                  )
                                }
                              />
                              <span>{component.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <div className="muted">
                          No components available. Create components first.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="muted">No status pages yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
