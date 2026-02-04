import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { MetricsChart } from "@/components/MetricsChart";
import { Card, CardTitle, Page, PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { ListContainer, ListRow } from "@/components/list";
import { Badge, Button, StatusBadge, isStatusType } from "@/components/ui";
import { MonitorsModals } from "@/components/modals/monitors";
import { toTitleCase } from "@/utils/format";
import {
  listMonitorsFn,
  deleteMonitorFn,
  updateMonitorFn,
  triggerSchedulerFn,
} from "@/server/functions/monitors";

type Monitor = {
  id: string;
  name: string;
  url: string | null;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  enabled: number;
  type: string;
  webhookToken?: string | null;
  externalConfig?: string | null;
  state?: { lastStatus?: string; lastLatencyMs?: number | null } | null;
};

export const Route = createFileRoute("/app/monitors")({
  component: Monitors,
  loader: async () => {
    const monitors = await listMonitorsFn();
    return { monitors: monitors.monitors };
  },
});

function Monitors() {
  const { monitors: initialMonitors } = Route.useLoaderData();

  const [monitors, setMonitors] = useState<Monitor[]>(initialMonitors);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonitorId, setExpandedMonitorId] = useState<string | null>(
    null,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [isManualStatusModalOpen, setIsManualStatusModalOpen] = useState(false);
  const [manualStatusMonitorId, setManualStatusMonitorId] = useState<
    string | null
  >(null);

  const deleteMonitor = useServerFn(deleteMonitorFn);
  const updateMonitor = useServerFn(updateMonitorFn);
  const listMonitors = useServerFn(listMonitorsFn);
  const triggerScheduler = useServerFn(triggerSchedulerFn);

  const refreshMonitors = async () => {
    try {
      const res = await listMonitors();
      setMonitors(res.monitors);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteMonitor({ data: { id } });
      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startEditing = (monitor: Monitor) => {
    setEditingMonitor(monitor);
    setIsEditModalOpen(true);
  };

  const cancelEditing = () => {
    setIsEditModalOpen(false);
    setEditingMonitor(null);
  };

  const openManualStatusModal = (monitorId: string) => {
    setManualStatusMonitorId(monitorId);
    setIsManualStatusModalOpen(true);
  };

  const closeManualStatusModal = () => {
    setIsManualStatusModalOpen(false);
    setManualStatusMonitorId(null);
  };

  const toggleEnabled = async (monitor: Monitor) => {
    setError(null);
    try {
      await updateMonitor({
        data: {
          id: monitor.id,
          enabled: monitor.enabled ? 0 : 1,
        },
      });
      await refreshMonitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onTriggerScheduler = async () => {
    setError(null);
    try {
      await triggerScheduler();
      window.setTimeout(refreshMonitors, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Page className="page-stack">
      <PageHeader
        title="Monitors"
        description="Track availability, latency, and incident thresholds."
      >
        <button onClick={() => setIsCreateModalOpen(true)}>
          Create Monitor
        </button>
      </PageHeader>

      {error ? <ErrorCard message={error} /> : null}

      <Card>
        <CardTitle className="flex flex-wrap items-center gap-4">
          Monitors
          <Button
            type="button"
            variant="outline"
            color="info"
            className="button-compact ml-auto"
            onClick={onTriggerScheduler}
            title="Manually trigger monitor checks (dev mode)"
          >
            Check Now
          </Button>
        </CardTitle>

        <ListContainer isEmpty={!monitors.length} emptyMessage="No monitors configured.">
          {monitors.map((monitor) => {
            const rawStatus = monitor.state?.lastStatus ?? "unknown";
            const status = isStatusType(rawStatus) ? rawStatus : "unknown";
            const isMetricsExpandable =
              monitor.type !== "webhook" && monitor.type !== "manual";
            const isMetricsExpanded = expandedMonitorId === monitor.id;

            return (
              <ListRow
                key={monitor.id}
                className="list-item-expanded"
                title={monitor.name}
                badges={
                  !monitor.enabled ? (
                    <Badge size="small" variant="muted">
                      Paused
                    </Badge>
                  ) : null
                }
                subtitle={
                  <>
                    {monitor.url ? <div>{monitor.url}</div> : null}
                    <div className={monitor.url ? "mt-1" : ""}>
                      <StatusBadge status={status}>{toTitleCase(status)}</StatusBadge>
                      {" · "}
                      <Badge size="small">{toTitleCase(monitor.type)}</Badge>
                      {isMetricsExpandable && (
                        <>
                          {" · "}
                          {monitor.intervalSeconds}s interval · {monitor.timeoutMs}ms timeout ·{" "}
                          {monitor.failureThreshold} failures
                        </>
                      )}
                    </div>
                  </>
                }
                actions={
                  <>
                    {isMetricsExpandable && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setExpandedMonitorId(isMetricsExpanded ? null : monitor.id)
                        }
                      >
                        {isMetricsExpanded ? "Hide" : "Metrics"}
                      </Button>
                    )}
                    {monitor.type === "manual" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openManualStatusModal(monitor.id)}
                      >
                        Set Status
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => startEditing(monitor)}
                    >
                      Edit
                    </Button>
                    {isMetricsExpandable && (
                      <Button
                        type="button"
                        variant="outline"
                        color={monitor.enabled ? "warning" : "success"}
                        onClick={() => toggleEnabled(monitor)}
                      >
                        {monitor.enabled ? "Pause" : "Resume"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      color="danger"
                      onClick={() => onDelete(monitor.id)}
                    >
                      Delete
                    </Button>
                  </>
                }
                expanded={isMetricsExpandable && isMetricsExpanded}
                expandedContent={
                  isMetricsExpandable ? (
                    <div className="mt-4">
                      <MetricsChart monitorId={monitor.id} />
                    </div>
                  ) : null
                }
              />
            );
          })}
        </ListContainer>
      </Card>
      <MonitorsModals
        isCreateOpen={isCreateModalOpen}
        onCloseCreate={closeCreateModal}
        isEditOpen={isEditModalOpen}
        onCloseEdit={cancelEditing}
        editingMonitor={editingMonitor}
        isManualStatusOpen={isManualStatusModalOpen}
        onCloseManualStatus={closeManualStatusModal}
        manualStatusMonitorId={manualStatusMonitorId}
        onSuccess={refreshMonitors}
      />
    </Page>
  );
}
