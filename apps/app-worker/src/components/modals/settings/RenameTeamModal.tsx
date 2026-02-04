import { useState, useEffect, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { updateTeamNameFn } from "@/server/functions/teams";

interface RenameTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  currentName: string;
}

export function RenameTeamModal({
  isOpen,
  onClose,
  onSuccess,
  currentName,
}: RenameTeamModalProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);

  const updateTeamName = useServerFn(updateTeamNameFn);

  useEffect(() => {
    setName(currentName);
  }, [currentName]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const onUpdateTeamName = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await updateTeamName({ data: { name } });
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Rename Team">
      <form className="form" onSubmit={onUpdateTeamName}>
        {error && <div className="form-error">{error}</div>}
        <label htmlFor="team-name">Team Name</label>
        <input
          id="team-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Team"
          required
        />
        <FormActions>
          <button type="submit">Save</button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
