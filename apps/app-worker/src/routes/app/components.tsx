import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { StatusBadge, isStatusType } from "@/components/ui";
import { CheckboxList } from "@/components/form";
import { ComponentMetrics } from "@/components/ComponentMetrics";
import {
  CreateComponentModal,
  EditComponentModal,
} from "@/components/modals/components";
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
    <div className="page page-stack">
      <PageHeader
        title="Components"
        description="Group monitors into logical service components for status pages."
      >
        <button onClick={() => setIsCreateModalOpen(true)}>
          Create Component
        </button>
      </PageHeader>

      {error && <ErrorCard message={error} />}

      <div className="card">
        <div className="card-title">Components</div>
        <div className="list">
          {components.length ? (
            components.map((component) => (
              <div key={component.id} className="list-item-expanded">
                <div className="list-row">
                  <div>
                    <div className="list-title flex flex-wrap items-center gap-2">
                      {component.name}
                      {component.currentStatus &&
                        component.currentStatus !== "operational" && (
                          <StatusBadge
                            status={
                              isStatusType(component.currentStatus)
                                ? component.currentStatus
                                : "unknown"
                            }
                          >
                            {toTitleCase(component.currentStatus)}
                          </StatusBadge>
                        )}
                    </div>
                    <div className="muted">
                      {component.description || "No description"}
                      {" · "}
                      {component.monitorIds.length} monitor
                      {component.monitorIds.length !== 1 ? "s" : ""} linked
                    </div>
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      className="outline"
                      onClick={() =>
                        setExpandedMetricsId(
                          expandedMetricsId === component.id
                            ? null
                            : component.id,
                        )
                      }
                    >
                      {expandedMetricsId === component.id ? "Hide" : "Metrics"}
                    </button>
                    <button
                      type="button"
                      className="outline"
                      onClick={() =>
                        setExpandedId(
                          expandedId === component.id ? null : component.id,
                        )
                      }
                    >
                      {expandedId === component.id ? "Hide" : "Link"} monitors
                    </button>
                    <button
                      type="button"
                      className="outline"
                      onClick={() => startEditing(component)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="outline button-danger"
                      onClick={() => onDelete(component.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expandedMetricsId === component.id && (
                  <div className="mt-4">
                    <ComponentMetrics
                      componentId={component.id}
                      componentName={component.name}
                    />
                  </div>
                )}

                {expandedId === component.id && (
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
              </div>
            ))
          ) : (
            <div className="muted">No components yet.</div>
          )}
        </div>
      </div>

      <CreateComponentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={refreshComponents}
      />

      <EditComponentModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingComponent(null);
        }}
        onSuccess={refreshComponents}
        component={editingComponent}
      />
    </div>
  );
}
