import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { listStatusPagesFn } from "@/server/functions/status-pages";
import {
  listIncidentsFn,
  createIncidentFn,
  updateIncidentFn,
  deleteIncidentFn,
} from "@/server/functions/incidents";

type StatusPage = {
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

const STATUS_OPTIONS = [
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
] as const;

export const Route = createFileRoute("/app/incidents")({
  component: Incidents,
  loader: async () => {
    const [incidentsRes, pagesRes] = await Promise.all([
      listIncidentsFn(),
      listStatusPagesFn(),
    ]);
    return {
      incidents: incidentsRes.incidents,
      statusPages: pagesRes.status_pages,
    };
  },
});

export default function Incidents() {
  const { incidents: initialIncidents, statusPages } = Route.useLoaderData();
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [status, setStatus] =
    useState<(typeof STATUS_OPTIONS)[number]["value"]>("investigating");
  const [statusPageId, setStatusPageId] = useState("");
  const [message, setMessage] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
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
      await createIncident({
        data: {
          title,
          status,
          statusPageId: statusPageId || undefined,
          message: message || undefined,
        },
      });
      await refreshIncidents();
      setTitle("");
      setStatus("investigating");
      setStatusPageId("");
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUpdate = async (incidentId: string) => {
    setError(null);
    try {
      await updateIncident({
        data: {
          incidentId,
          message: updateMessage,
          status: updateStatus,
        },
      });
      await refreshIncidents();
      setUpdateMessage("");
      setExpandedId(null);
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
      <div className="page-header">
        <div>
          <h2>Incidents</h2>
          <p>Track and communicate service disruptions.</p>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div className="card-title">Report incident</div>
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
          <button type="submit">Create incident</button>
        </form>
      </div>

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
                        onClick={() => {
                          setExpandedId(
                            expandedId === incident.id ? null : incident.id,
                          );
                          setUpdateStatus(
                            incident.status as (typeof STATUS_OPTIONS)[number]["value"],
                          );
                        }}
                      >
                        {expandedId === incident.id ? "Cancel" : "Update"}
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

                {expandedId === incident.id && (
                  <div className="nested-form">
                    <label htmlFor={`update-status-${incident.id}`}>
                      New status
                    </label>
                    <select
                      id={`update-status-${incident.id}`}
                      value={updateStatus}
                      onChange={(event) =>
                        setUpdateStatus(
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
                    <label htmlFor={`update-message-${incident.id}`}>
                      Update message
                    </label>
                    <textarea
                      id={`update-message-${incident.id}`}
                      value={updateMessage}
                      onChange={(event) => setUpdateMessage(event.target.value)}
                      placeholder="The issue has been identified..."
                      rows={2}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => onUpdate(incident.id)}
                      disabled={!updateMessage.trim()}
                    >
                      Post update
                    </button>
                  </div>
                )}

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
    </div>
  );
}
