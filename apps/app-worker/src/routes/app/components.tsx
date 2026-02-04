import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardTitle, Page, PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { ListContainer, ListRow } from "@/components/list";
import { Button, StatusBadge, isStatusType } from "@/components/ui";
import { CheckboxList } from "@/components/form";
import { ComponentMetrics } from "@/components/ComponentMetrics";
import { ComponentsModals } from "@/components/modals/components";
import { toTitleCase } from "@/utils/format";
import { listMonitorsFn } from "@/server/functions/monitors";
import {
  listComponentsFn,
  deleteComponentFn,
  linkMonitorFn,
  unlinkMonitorFn,
} from "@/server/functions/components";

type Monitor = {
  id: string;
  name: string;
};

type Component = {
  id: string;
  name: string;
  description: string | null;
  monitorIds: string[];
  currentStatus?: string;
  statusUpdatedAt?: number | null;
};

export const Route = createFileRoute("/app/components")({
  component: Components,
  loader: async () => {
    const [componentsRes, monitorsRes] = await Promise.all([
      listComponentsFn(),
      listMonitorsFn(),
    ]);
    return {
      components: componentsRes.components,
      monitors: monitorsRes.monitors,
    };
  },
});

export default function Components() {
  const { components: initialComponents, monitors: initialMonitors } =
    Route.useLoaderData();
  const [components, setComponents] = useState<Component[]>(initialComponents);
  const [monitors] = useState<Monitor[]>(initialMonitors);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMetricsId, setExpandedMetricsId] = useState<string | null>(
    null,
  );

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(
    null,
  );

  const deleteComponent = useServerFn(deleteComponentFn);
  const listComponents = useServerFn(listComponentsFn);
  const linkMonitor = useServerFn(linkMonitorFn);
  const unlinkMonitor = useServerFn(unlinkMonitorFn);

  const refreshComponents = async () => {
    try {
      const res = await listComponents();
      setComponents(res.components);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startEditing = (component: Component) => {
    setEditingComponent(component);
    setIsEditModalOpen(true);
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteComponent({ data: { id } });
      setComponents((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onToggleMonitor = async (
    componentId: string,
    monitorId: string,
    checked: boolean,
  ) => {
    setError(null);
    try {
      const component = components.find((c) => c.id === componentId);
      if (!component) return;

      const wasLinked = component.monitorIds.includes(monitorId);
      if (checked && !wasLinked) {
        await linkMonitor({ data: { componentId, monitorId } });
      } else if (!checked && wasLinked) {
        await unlinkMonitor({ data: { componentId, monitorId } });
      }
      await refreshComponents();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Page className="page-stack">
      <PageHeader
        title="Components"
        description="Group monitors into logical service components for status pages."
      >
        <button onClick={() => setIsCreateModalOpen(true)}>Create Component</button>
      </PageHeader>

      {error && <ErrorCard message={error} />}

      <Card>
        <CardTitle>Components</CardTitle>
        <ListContainer isEmpty={!components.length} emptyMessage="No components yet.">
          {components.map((component) => {
            const isLinkExpanded = expandedId === component.id;
            const isMetricsExpanded = expandedMetricsId === component.id;

            return (
              <ListRow
                key={component.id}
                className="list-item-expanded"
                title={component.name}
                badges={
                  component.currentStatus &&
                  component.currentStatus !== "operational" ? (
                    <StatusBadge
                      status={
                        isStatusType(component.currentStatus)
                          ? component.currentStatus
                          : "unknown"
                      }
                    >
                      {toTitleCase(component.currentStatus)}
                    </StatusBadge>
                  ) : null
                }
                subtitle={
                  <>
                    {component.description || "No description"}
                    {" · "}
                    {component.monitorIds.length} monitor
                    {component.monitorIds.length !== 1 ? "s" : ""} linked
                  </>
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setExpandedMetricsId(isMetricsExpanded ? null : component.id)
                      }
                    >
                      {isMetricsExpanded ? "Hide" : "Metrics"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setExpandedId(isLinkExpanded ? null : component.id)}
                    >
                      {isLinkExpanded ? "Hide" : "Link"} monitors
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => startEditing(component)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      color="danger"
                      onClick={() => onDelete(component.id)}
                    >
                      Delete
                    </Button>
                  </>
                }
                expanded={isMetricsExpanded || isLinkExpanded}
                expandedContent={
                  <>
                    {isMetricsExpanded && (
                      <div className="mt-4">
                        <ComponentMetrics
                          componentId={component.id}
                          componentName={component.name}
                        />
                      </div>
                    )}
                    {isLinkExpanded && (
                      <CheckboxList
                        items={monitors.map((monitor) => ({
                          id: monitor.id,
                          label: monitor.name,
                          checked: component.monitorIds.includes(monitor.id),
                        }))}
                        onChange={(monitorId, checked) =>
                          onToggleMonitor(component.id, monitorId, checked)
                        }
                        emptyMessage="No monitors available. Create monitors first."
                      />
                    )}
                  </>
                }
              />
            );
          })}
        </ListContainer>
      </Card>

      <ComponentsModals
        isCreateOpen={isCreateModalOpen}
        onCloseCreate={() => setIsCreateModalOpen(false)}
        isEditOpen={isEditModalOpen}
        onCloseEdit={() => {
          setIsEditModalOpen(false);
          setEditingComponent(null);
        }}
        editingComponent={editingComponent}
        onSuccess={refreshComponents}
      />
    </Page>
  );
}
