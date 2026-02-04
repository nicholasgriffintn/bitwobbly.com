import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { createComponentFn } from "@/server/functions/components";

interface CreateComponentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function CreateComponentModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateComponentModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createComponent = useServerFn(createComponentFn);

  const handleClose = () => {
    setName("");
    setDescription("");
    setError(null);
    onClose();
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createComponent({
        data: { name, description: description || undefined },
      });
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Component">
      <form className="form" onSubmit={onCreate}>
        {error && <div className="form-error">{error}</div>}
        <label htmlFor="component-name">Name</label>
        <input
          id="component-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="API Gateway"
          required
        />
        <label htmlFor="component-description">Description (optional)</label>
        <input
          id="component-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Core API services"
        />
        <FormActions>
          <button type="submit">Create Component</button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
