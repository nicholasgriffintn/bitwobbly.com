import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardTitle, Page, PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { CheckboxList } from "@/components/form";
import { ListContainer, ListRow } from "@/components/list";
import { Button } from "@/components/ui";
import { StatusPagesModals } from "@/components/modals/status-pages";
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
  access_mode: "public" | "private" | "internal";
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string | null;
  custom_css: string | null;
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
  const accessLabel = (mode: StatusPage["access_mode"]) => {
    if (mode === "public") return "Public";
    if (mode === "private") return "Password";
    return "Internal";
  };

  return (
    <Page className="page-stack">
      <PageHeader
        title="Status pages"
        description="Publish uptime updates for your customers."
      >
        <button onClick={() => setIsCreateModalOpen(true)}>
          Create Status Page
        </button>
      </PageHeader>

      {error && <ErrorCard message={error} />}

      <Card>
        <CardTitle>Status pages</CardTitle>
        <ListContainer isEmpty={!pages.length} emptyMessage="No status pages yet.">
          {pages.map((page) => {
            const isExpanded = expandedPageId === page.id;

            return (
              <ListRow
                key={page.id}
                className="list-item-expanded"
                title={page.name}
                subtitle={`/${page.slug} • ${accessLabel(page.access_mode)}`}
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openPublicPage(page.slug)}
                    >
                      View
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setExpandedPageId(isExpanded ? null : page.id)}
                    >
                      {isExpanded ? "Hide" : "Components"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => startEditing(page)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      color="danger"
                      onClick={() => onDelete(page.id)}
                    >
                      Delete
                    </Button>
                  </>
                }
                expanded={isExpanded}
                expandedContent={
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
                }
              />
            );
          })}
        </ListContainer>
      </Card>

      <StatusPagesModals
        isCreateOpen={isCreateModalOpen}
        onCloseCreate={() => setIsCreateModalOpen(false)}
        isEditOpen={isEditModalOpen}
        onCloseEdit={() => {
          setIsEditModalOpen(false);
          setEditingPage(null);
        }}
        editingPage={editingPage}
        onSuccess={refreshPages}
      />
    </Page>
  );
}
