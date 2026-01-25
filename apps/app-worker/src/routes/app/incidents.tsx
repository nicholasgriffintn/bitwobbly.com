import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { listStatusPagesFn } from "@/server/functions/status-pages";
import {
  listIncidentsFn,
  createIncidentFn,
  updateIncidentFn,
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
  description: string | null;
  monitorIds: string[];
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

const STATUS_OPTIONS = [
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
] as const;

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

  const [title, setTitle] = useState("");
  const [status, setStatus] =
    useState<(typeof STATUS_OPTIONS)[number]["value"]>("investigating");
  const [statusPageId, setStatusPageId] = useState("");
  const [message, setMessage] = useState("");
  const [selectedComponents, setSelectedComponents] = useState<
    Map<string, string>
  >(new Map());

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updatingIncidentId, setUpdatingIncidentId] = useState<string | null>(
    null,
  );
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateStatus, setUpdateStatus] =
    useState<(typeof STATUS_OPTIONS)[number]["value"]>("investigating");

  const createIncident = useServerFn(createIncidentFn);
  const updateIncident = useServerFn(updateIncidentFn);
  const deleteIncident = useServerFn(deleteIncidentFn);
  const listIncidents = useServerFn(listIncidentsFn);

  const refreshIncidents = async () => {
    try {
      const res = await listIncidents();
      setIncidents(res.incidents);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const affectedComponents =
        selectedComponents.size > 0
          ? Array.from(selectedComponents.entries()).map(
              ([componentId, impactLevel]) => ({
                componentId,
                impactLevel,
              }),
            )
          : undefined;

      await createIncident({
        data: {
          title,
          status,
          statusPageId: statusPageId || undefined,
          message: message || undefined,
          affectedComponents,
        },
      });
      await refreshIncidents();
      setTitle("");
      setStatus("investigating");
      setStatusPageId("");
      setMessage("");
      setSelectedComponents(new Map());
      setIsCreateModalOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openUpdateModal = (incident: Incident) => {
    setUpdatingIncidentId(incident.id);
    setUpdateStatus(
      incident.status as (typeof STATUS_OPTIONS)[number]["value"],
    );
    setUpdateMessage("");
    setIsUpdateModalOpen(true);
  };

  const onUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!updatingIncidentId) return;
    setError(null);
    try {
      await updateIncident({
        data: {
          incidentId: updatingIncidentId,
          message: updateMessage,
          status: updateStatus,
        },
      });
      await refreshIncidents();
      setUpdateMessage("");
      setUpdatingIncidentId(null);
      setIsUpdateModalOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteIncident({ data: { id } });
      setIncidents((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusPageName = (id: string | null) => {
    if (!id) return "None";
    const page = statusPages.find((p) => p.id === id);
    return page?.name || "Unknown";
  };

  return (
    <div className="page">
      <div className="page-header mb-6">
        <div>
          <h2>Incidents</h2>
          <p>Track and communicate service disruptions.</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)}>
          Report Incident
        </button>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div className="card-title">Incidents</div>
        <div className="list">
          {incidents.length ? (
            incidents.map((incident) => (
              <div key={incident.id} className="list-item-expanded">
                <div className="list-row">
                  <div>
                    <div className="list-title">
                      {incident.title}
                      <span
                        className={`status-pill ${incident.status}`}
                        style={{ marginLeft: "0.5rem" }}
                      >
                        {incident.status}
                      </span>
                    </div>
                    <div className="muted">
                      Started {formatDate(incident.startedAt)}
                      {incident.resolvedAt &&
                        ` · Resolved ${formatDate(incident.resolvedAt)}`}
                      {" · "}
                      {getStatusPageName(incident.statusPageId)}
                    </div>
                  </div>
                  <div className="button-row">
                    {incident.status !== "resolved" && (
                      <button
                        type="button"
                        className="outline"
                        onClick={() => openUpdateModal(incident)}
                      >
                        Update
                      </button>
                    )}
                    <button
                      type="button"
                      className="outline"
                      onClick={() => onDelete(incident.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {incident.updates.length > 0 && (
                  <div className="timeline">
                    {incident.updates.map((update) => (
                      <div key={update.id} className="timeline-item">
                        <span className={`status-dot ${update.status}`} />
                        <div>
                          <div className="timeline-status">{update.status}</div>
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
                )}
              </div>
            ))
          ) : (
            <div className="muted">No incidents recorded.</div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Report Incident"
      >
        <form className="form" onSubmit={onCreate}>
          <label htmlFor="incident-title">Title</label>
          <input
            id="incident-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="API degraded performance"
            required
          />
          <div className="grid two">
            <div>
              <label htmlFor="incident-status">Status</label>
              <select
                id="incident-status"
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target
                      .value as (typeof STATUS_OPTIONS)[number]["value"],
                  )
                }
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="incident-page">Status page (optional)</label>
              <select
                id="incident-page"
                value={statusPageId}
                onChange={(event) => setStatusPageId(event.target.value)}
              >
                <option value="">None</option>
                {statusPages.map((page: StatusPage) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label htmlFor="incident-message">Initial message (optional)</label>
          <textarea
            id="incident-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="We are investigating reports of..."
            rows={3}
          />
          {components.length > 0 && (
            <>
              <label style={{ marginTop: "1rem" }}>
                Affected components (optional)
              </label>
              <div
                style={{
                  marginTop: "0.5rem",
                  maxHeight: "200px",
                  overflow: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  padding: "0.5rem",
                }}
              >
                {components.map((component) => {
                  const isSelected = selectedComponents.has(component.id);
                  const impactLevel =
                    selectedComponents.get(component.id) || "degraded";
                  return (
                    <div
                      key={component.id}
                      style={{
                        marginBottom: "0.5rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        id={`component-${component.id}`}
                        checked={isSelected}
                        onChange={(e) => {
                          const newMap = new Map(selectedComponents);
                          if (e.target.checked) {
                            newMap.set(component.id, "degraded");
                          } else {
                            newMap.delete(component.id);
                          }
                          setSelectedComponents(newMap);
                        }}
                      />
                      <label
                        htmlFor={`component-${component.id}`}
                        style={{ flex: 1, margin: 0 }}
                      >
                        {component.name}
                      </label>
                      {isSelected && (
                        <select
                          value={impactLevel}
                          onChange={(e) => {
                            const newMap = new Map(selectedComponents);
                            newMap.set(component.id, e.target.value);
                            setSelectedComponents(newMap);
                          }}
                          style={{ width: "auto", padding: "0.25rem" }}
                        >
                          <option value="degraded">Degraded</option>
                          <option value="down">Down</option>
                          <option value="maintenance">Maintenance</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="submit">Create Incident</button>
            <button
              type="button"
              className="outline"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        title="Update Incident"
      >
        <form className="form" onSubmit={onUpdate}>
          <label htmlFor="update-status">New status</label>
          <select
            id="update-status"
            value={updateStatus}
            onChange={(event) =>
              setUpdateStatus(
                event.target.value as (typeof STATUS_OPTIONS)[number]["value"],
              )
            }
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <label htmlFor="update-message">Update message</label>
          <textarea
            id="update-message"
            value={updateMessage}
            onChange={(event) => setUpdateMessage(event.target.value)}
            placeholder="The issue has been identified..."
            rows={3}
            required
          />
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="submit" disabled={!updateMessage.trim()}>
              Post Update
            </button>
            <button
              type="button"
              className="outline"
              onClick={() => setIsUpdateModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
