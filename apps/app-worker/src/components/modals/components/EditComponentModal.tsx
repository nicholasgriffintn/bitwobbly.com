import { useState, useEffect, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { updateComponentFn } from "@/server/functions/components";

interface EditComponentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  component: {
    id: string;
    name: string;
    description: string | null;
  } | null;
}

export function EditComponentModal({
  isOpen,
  onClose,
  onSuccess,
  component,
}: EditComponentModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updateComponent = useServerFn(updateComponentFn);

  useEffect(() => {
    if (component) {
      setName(component.name);
      setDescription(component.description || "");
    }
  }, [component]);

  const handleClose = () => {
    setName("");
    setDescription("");
    setError(null);
    onClose();
  };

  const onUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!component) return;
    setError(null);
    try {
      await updateComponent({
        data: {
          id: component.id,
          name,
          description: description || null,
        },
      });
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Component">
      <form className="form" onSubmit={onUpdate}>
        {error && <div className="form-error">{error}</div>}
        <label htmlFor="edit-component-name">Name</label>
        <input
          id="edit-component-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <label htmlFor="edit-component-description">
          Description (optional)
        </label>
        <input
          id="edit-component-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <FormActions>
          <button type="submit">Save Changes</button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
