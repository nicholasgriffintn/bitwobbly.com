import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { deleteSentryProjectFn } from "@/server/functions/sentry";

interface DeleteProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  projectId: string | null;
}

export function DeleteProjectModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
}: DeleteProjectModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteProject = useServerFn(deleteSentryProjectFn);

  const handleClose = () => {
    setError(null);
    setIsLoading(false);
    onClose();
  };

  const onDelete = async () => {
    if (!projectId) return;
    setError(null);
    setIsLoading(true);
    try {
      await deleteProject({ data: { projectId } });
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Delete Project">
      <div className="form">
        {error ? <div className="form-error">{error}</div> : null}
        <p>
          Are you sure you want to delete this project? This will permanently
          delete all associated issues, events, and keys. This action cannot be
          undone.
        </p>
        <FormActions>
          <button
            type="button"
            onClick={onDelete}
            disabled={isLoading}
            className="button-danger"
          >
            {isLoading ? "Deleting..." : "Delete Project"}
          </button>
          <button
            type="button"
            className="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </button>
        </FormActions>
      </div>
    </Modal>
  );
}
