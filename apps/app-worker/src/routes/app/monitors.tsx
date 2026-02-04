import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { MetricsChart } from "@/components/MetricsChart";
import { PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { Badge, StatusBadge, isStatusType } from "@/components/ui";
import {
  CreateMonitorModal,
  EditMonitorModal,
  ManualStatusModal,
} from "@/components/modals/monitors";
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
    <div className="page page-stack">
      <PageHeader
        title="Monitors"
        description="Track availability, latency, and incident thresholds."
      >
        <button onClick={() => setIsCreateModalOpen(true)}>Create Monitor</button>
      </PageHeader>

      {error ? <ErrorCard message={error} /> : null}

      <div className="card">
        <div className="card-title flex flex-wrap items-center gap-4">
          Monitors
          <button
            type="button"
            className="outline button-info button-compact ml-auto"
            onClick={onTriggerScheduler}
            title="Manually trigger monitor checks (dev mode)"
          >
            Check Now
          </button>
        </div>
        <div className="list">
          {monitors.length ? (
            monitors.map((monitor) => {
              const rawStatus = monitor.state?.lastStatus ?? "unknown";
              const status = isStatusType(rawStatus) ? rawStatus : "unknown";

              return (
                <React.Fragment key={monitor.id}>
                  <div className="list-item-expanded">
                    <div className="list-row">
                      <div className="flex-1">
                        <div className="list-title">
                          {monitor.name}
                          {!monitor.enabled && (
                            <span className="ml-2">
                              <Badge size="small" variant="muted">
                                Paused
                              </Badge>
                            </span>
                          )}
                        </div>
                        {monitor.url && (
                          <div className="muted">{monitor.url}</div>
                        )}
                        <div className="muted mt-1">
                          <StatusBadge status={status}>
                            {toTitleCase(status)}
                          </StatusBadge>
                          {" · "}
                          <Badge size="small">{toTitleCase(monitor.type)}</Badge>
                          {monitor.type !== "webhook" &&
                            monitor.type !== "manual" && (
                              <>
                                {" · "}
                                {monitor.intervalSeconds}s interval ·{" "}
                                {monitor.timeoutMs}ms timeout ·{" "}
                                {monitor.failureThreshold} failures
                              </>
                            )}
                        </div>
                      </div>
                      <div className="button-row">
                        {monitor.type !== "webhook" &&
                          monitor.type !== "manual" && (
                            <button
                              type="button"
                              className="outline"
                              onClick={() =>
                                setExpandedMonitorId(
                                  expandedMonitorId === monitor.id
                                    ? null
                                    : monitor.id,
                                )
                              }
                            >
                              {expandedMonitorId === monitor.id
                                ? "Hide"
                                : "Metrics"}
                            </button>
                          )}
                        {monitor.type === "manual" && (
                          <button
                            type="button"
                            className="outline"
                            onClick={() => openManualStatusModal(monitor.id)}
                          >
                            Set Status
                          </button>
                        )}
                        <button
                          type="button"
                          className="outline"
                          onClick={() => startEditing(monitor)}
                        >
                          Edit
                        </button>
                        {monitor.type !== "webhook" &&
                          monitor.type !== "manual" && (
                            <button
                              type="button"
                              className={`outline ${monitor.enabled ? "button-warning" : "button-success"}`}
                              onClick={() => toggleEnabled(monitor)}
                            >
                              {monitor.enabled ? "Pause" : "Resume"}
                            </button>
                          )}
                        <button
                          type="button"
                          className="outline button-danger"
                          onClick={() => onDelete(monitor.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {expandedMonitorId === monitor.id && (
                      <div className="mt-4">
                        <MetricsChart monitorId={monitor.id} />
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })
          ) : (
            <div className="muted">No monitors configured.</div>
          )}
        </div>
      </div>
      <CreateMonitorModal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        onSuccess={refreshMonitors}
      />

      <EditMonitorModal
        isOpen={isEditModalOpen}
        onClose={cancelEditing}
        onSuccess={refreshMonitors}
        monitor={editingMonitor}
      />

      <ManualStatusModal
        isOpen={isManualStatusModalOpen}
        onClose={closeManualStatusModal}
        onSuccess={refreshMonitors}
        monitorId={manualStatusMonitorId}
      />
    </div>
  );
}
