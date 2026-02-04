import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { deleteTeamFn } from "@/server/functions/teams";

interface DeleteTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DeleteTeamModal({ isOpen, onClose }: DeleteTeamModalProps) {
  const [error, setError] = useState<string | null>(null);

  const deleteTeam = useServerFn(deleteTeamFn);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const onDeleteTeam = async () => {
    setError(null);
    try {
      await deleteTeam();
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      handleClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Delete Team">
      <div className="form">
        {error && <div className="form-error">{error}</div>}
        <p>
          Are you sure you want to delete this team? This action cannot be
          undone. You must first delete all monitors, status pages, and projects
          associated with this team.
        </p>
        <FormActions>
          <button
            type="button"
            className="outline button-danger"
            onClick={onDeleteTeam}
          >
            Delete Team
          </button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </div>
    </Modal>
  );
}
