import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardTitle, Page, PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { ListContainer, ListRow } from "@/components/list";
import { Button, StatusBadge, isStatusType } from "@/components/ui";
import { IncidentsModals } from "@/components/modals/incidents";
import { toTitleCase } from "@/utils/format";
import { listStatusPagesFn } from "@/server/functions/status-pages";
import {
  listIncidentsFn,
  deleteIncidentFn,
} from "@/server/functions/incidents";
import { listComponentsFn } from "@/server/functions/components";

type StatusPage = {
  id: string;
  name: string;
};

type Component = {
  id: string;
  name: string;
};

type IncidentUpdate = {
  id: string;
  message: string;
  status: string;
  createdAt: string;
};

type Incident = {
  id: string;
  title: string;
  status: string;
  statusPageId: string | null;
  startedAt: number;
  resolvedAt: number | null;
  updates: IncidentUpdate[];
};

export const Route = createFileRoute("/app/incidents")({
  component: Incidents,
  loader: async () => {
    const [incidentsRes, pagesRes, componentsRes] = await Promise.all([
      listIncidentsFn(),
      listStatusPagesFn(),
      listComponentsFn(),
    ]);
    return {
      incidents: incidentsRes.incidents,
      statusPages: pagesRes.status_pages,
      components: componentsRes.components,
    };
  },
});

export default function Incidents() {
  const {
    incidents: initialIncidents,
    statusPages,
    components,
  } = Route.useLoaderData();
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [error, setError] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updatingIncident, setUpdatingIncident] = useState<Incident | null>(
    null
  );

  const deleteIncident = useServerFn(deleteIncidentFn);
  const listIncidents = useServerFn(listIncidentsFn);

  const refreshIncidents = async () => {
    try {
      const res = await listIncidents();
      setIncidents(res.incidents);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openUpdateModal = (incident: Incident) => {
    setUpdatingIncident(incident);
    setIsUpdateModalOpen(true);
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteIncident({ data: { id } });
      setIncidents((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusPageName = (id: string | null) => {
    if (!id) return "None";
    const page = statusPages.find((p: StatusPage) => p.id === id);
    return page?.name || "Unknown";
  };

  return (
    <Page className="page-stack">
      <PageHeader
        title="Incidents"
        description="Track and communicate service disruptions."
      >
        <button onClick={() => setIsCreateModalOpen(true)}>
          Report Incident
        </button>
      </PageHeader>

      {error && <ErrorCard message={error} />}

      <Card>
        <CardTitle>Incidents</CardTitle>
        <ListContainer
          isEmpty={!incidents.length}
          emptyMessage="No incidents recorded."
        >
          {incidents.map((incident) => {
            const status = isStatusType(incident.status)
              ? incident.status
              : "unknown";

            return (
              <ListRow
                key={incident.id}
                className="list-item-expanded"
                title={incident.title}
                badges={
                  <StatusBadge status={status}>
                    {toTitleCase(incident.status)}
                  </StatusBadge>
                }
                subtitle={
                  <>
                    Started {formatDate(incident.startedAt)}
                    {incident.resolvedAt &&
                      ` · Resolved ${formatDate(incident.resolvedAt)}`}
                    {" · "}
                    {getStatusPageName(incident.statusPageId)}
                  </>
                }
                actions={
                  <>
                    {incident.status !== "resolved" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openUpdateModal(incident)}
                      >
                        Update
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      color="danger"
                      onClick={() => onDelete(incident.id)}
                    >
                      Delete
                    </Button>
                  </>
                }
                expanded={incident.updates.length > 0}
                expandedContent={
                  incident.updates.length > 0 ? (
                    <div className="timeline">
                      {incident.updates.map((update) => (
                        <div key={update.id} className="timeline-item">
                          <span className={`status-dot ${update.status}`} />
                          <div>
                            <div className="timeline-status">
                              {toTitleCase(update.status)}
                            </div>
                            <div className="timeline-message">
                              {update.message}
                            </div>
                            <div className="muted">
                              {new Date(update.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null
                }
              />
            );
          })}
        </ListContainer>
      </Card>

      <IncidentsModals
        isCreateOpen={isCreateModalOpen}
        onCloseCreate={() => setIsCreateModalOpen(false)}
        isUpdateOpen={isUpdateModalOpen}
        onCloseUpdate={() => {
          setIsUpdateModalOpen(false);
          setUpdatingIncident(null);
        }}
        updatingIncident={updatingIncident}
        onSuccess={refreshIncidents}
        statusPages={statusPages as StatusPage[]}
        components={components as Component[]}
      />
    </Page>
  );
}
