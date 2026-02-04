import { useState, useEffect, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { updateIncidentFn } from "@/server/functions/incidents";

const STATUS_OPTIONS = [
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
] as const;

interface UpdateIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  incident: {
    id: string;
    status: string;
  } | null;
}

export function UpdateIncidentModal({
  isOpen,
  onClose,
  onSuccess,
  incident,
}: UpdateIncidentModalProps) {
  const [status, setStatus] = useState("investigating");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updateIncident = useServerFn(updateIncidentFn);

  useEffect(() => {
    if (incident) {
      setStatus(incident.status);
      setMessage("");
    }
  }, [incident]);

  const handleClose = () => {
    setMessage("");
    setError(null);
    onClose();
  };

  const onUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!incident) return;
    setError(null);
    try {
      await updateIncident({
        data: {
          incidentId: incident.id,
          message,
          status,
        },
      });
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Update Incident">
      <form className="form" onSubmit={onUpdate}>
        {error && <div className="form-error">{error}</div>}
        <label htmlFor="update-status">New status</label>
        <select
          id="update-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
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
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="The issue has been identified..."
          rows={3}
          required
        />
        <FormActions>
          <button type="submit" disabled={!message.trim()}>
            Post Update
          </button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
