import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { createTeamFn } from "@/server/functions/teams";

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTeamModal({ isOpen, onClose }: CreateTeamModalProps) {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTeam = useServerFn(createTeamFn);

  const handleClose = () => {
    setName("");
    setError(null);
    onClose();
  };

  const onCreateTeam = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Team name is required.");
      return;
    }

    setIsCreating(true);
    try {
      await createTeam({ data: { name: trimmedName } });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Team">
      <form className="form" onSubmit={onCreateTeam}>
        <p className="muted mt-0">Creating a team will switch you to it.</p>
        <label htmlFor="new-team-name">Team Name</label>
        <input
          id="new-team-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Team"
          required
        />
        {error && <div className="form-error">{error}</div>}
        <FormActions>
          <button
            type="submit"
            className="button-success"
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "Create Team"}
          </button>
          <button
            type="button"
            className="outline"
            onClick={handleClose}
            disabled={isCreating}
          >
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
