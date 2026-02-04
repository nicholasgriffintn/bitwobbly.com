import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { CheckboxList } from "@/components/form";
import {
  CreateStatusPageModal,
  EditStatusPageModal,
} from "@/components/modals/status-pages";
import {
  listStatusPagesFn,
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

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<StatusPage | null>(null);

  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);
  const [pageComponents, setPageComponents] = useState<PageComponent[]>([]);

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
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const loadPageComponents = async (pageId: string) => {
    try {
      const res = await getPageComponents({ data: { statusPageId: pageId } });
      setPageComponents(res.components);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (expandedPageId) {
      loadPageComponents(expandedPageId);
    }
  }, [expandedPageId]);

  const startEditing = (page: StatusPage) => {
    setEditingPage(page);
    setIsEditModalOpen(true);
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteStatusPage({ data: { id } });
      setPages((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onToggleComponent = async (
    pageId: string,
    componentId: string,
    checked: boolean,
  ) => {
    setError(null);
    try {
      const linked = pageComponents.some(
        (pc) => pc.componentId === componentId,
      );
      if (checked && !linked) {
        await linkToPage({
          data: { statusPageId: pageId, componentId, sortOrder: 0 },
        });
      } else if (!checked && linked) {
        await unlinkFromPage({ data: { statusPageId: pageId, componentId } });
      }
      await loadPageComponents(pageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openPublicPage = (slug: string) => {
    window.open(`/status/${slug}`, "_blank");
  };

  const linkedComponentIds = pageComponents.map((pc) => pc.componentId);

  return (
    <div className="page page-stack">
      <PageHeader
        title="Status pages"
        description="Publish uptime updates for your customers."
      >
        <button onClick={() => setIsCreateModalOpen(true)}>
          Create Status Page
        </button>
      </PageHeader>

      {error && <ErrorCard message={error} />}

      <div className="card">
        <div className="card-title">Status pages</div>
        <div className="list">
          {pages.length ? (
            pages.map((page) => {
              const isExpanded = expandedPageId === page.id;

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
                        {isExpanded ? "Hide" : "Components"}
                      </button>
                      <button
                        type="button"
                        className="outline"
                        onClick={() => startEditing(page)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="outline button-danger"
                        onClick={() => onDelete(page.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="nested-list">
                      <div className="muted mb-2">
                        Link components to display on this status page:
                      </div>
                      <CheckboxList
                        items={components.map((component) => ({
                          id: component.id,
                          label: component.name,
                          checked: linkedComponentIds.includes(component.id),
                        }))}
                        onChange={(componentId, checked) =>
                          onToggleComponent(page.id, componentId, checked)
                        }
                        emptyMessage="No components available. Create components first."
                        className="!border-none !bg-transparent !p-0"
                      />
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

      <CreateStatusPageModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={refreshPages}
      />

      <EditStatusPageModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingPage(null);
        }}
        onSuccess={refreshPages}
        page={editingPage}
      />
    </div>
  );
}
