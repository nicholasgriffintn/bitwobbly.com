import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { setManualMonitorStatusFn } from "@/server/functions/monitors";

interface ManualStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  monitorId: string | null;
}

export function ManualStatusModal({
  isOpen,
  onClose,
  onSuccess,
  monitorId,
}: ManualStatusModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState("up");
  const [manualMessage, setManualMessage] = useState("");

  const setManualMonitorStatus = useServerFn(setManualMonitorStatusFn);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setManualStatus("up");
    setManualMessage("");
  }, [isOpen]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const onSetManualStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!monitorId) return;
    setError(null);
    try {
      await setManualMonitorStatus({
        data: {
          monitorId,
          status: manualStatus,
          message: manualMessage || undefined,
        },
      });
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Set Manual Status">
      {error ? <div className="form-error">{error}</div> : null}

      <form className="form" onSubmit={onSetManualStatus}>
        <label htmlFor="manual-status">Status</label>
        <select
          id="manual-status"
          value={manualStatus}
          onChange={(e) => setManualStatus(e.target.value)}
        >
          <option value="up">Up</option>
          <option value="down">Down</option>
          <option value="degraded">Degraded</option>
        </select>

        <label htmlFor="manual-message">Message (optional)</label>
        <input
          id="manual-message"
          value={manualMessage}
          onChange={(e) => setManualMessage(e.target.value)}
          placeholder="Optional status message"
        />

        <div className="button-row mt-4">
          <button type="submit">Update Status</button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
