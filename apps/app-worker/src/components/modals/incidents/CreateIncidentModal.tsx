import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { createIncidentFn } from "@/server/functions/incidents";

type StatusPage = {
  id: string;
  name: string;
};

type Component = {
  id: string;
  name: string;
};

const STATUS_OPTIONS = [
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
] as const;

interface CreateIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  statusPages: StatusPage[];
  components: Component[];
}

export function CreateIncidentModal({
  isOpen,
  onClose,
  onSuccess,
  statusPages,
  components,
}: CreateIncidentModalProps) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("investigating");
  const [statusPageId, setStatusPageId] = useState("");
  const [message, setMessage] = useState("");
  const [selectedComponents, setSelectedComponents] = useState<
    Map<string, string>
  >(new Map());
  const [error, setError] = useState<string | null>(null);

  const createIncident = useServerFn(createIncidentFn);

  const handleClose = () => {
    setTitle("");
    setStatus("investigating");
    setStatusPageId("");
    setMessage("");
    setSelectedComponents(new Map());
    setError(null);
    onClose();
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
              })
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
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Report Incident">
      <form className="form" onSubmit={onCreate}>
        {error && <div className="form-error">{error}</div>}
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
              onChange={(event) => setStatus(event.target.value)}
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
              {statusPages.map((page) => (
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
            <label className="mt-4">Affected components (optional)</label>
            <div className="mt-2 max-h-[200px] overflow-auto rounded border border-[color:var(--border)] p-2">
              {components.map((component) => {
                const isSelected = selectedComponents.has(component.id);
                const impactLevel =
                  selectedComponents.get(component.id) || "degraded";
                return (
                  <div
                    key={component.id}
                    className="mb-2 flex items-center gap-2"
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
                      className="m-0 flex-1"
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
                        className="w-auto p-1"
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
        <FormActions>
          <button type="submit">Create Incident</button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
