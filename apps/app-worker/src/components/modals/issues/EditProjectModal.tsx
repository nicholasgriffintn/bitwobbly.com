import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { PlatformSelect } from "@/components/PlatformSelect";
import { updateSentryProjectFn } from "@/server/functions/sentry";

type Component = { id: string; name: string };
type SentryProject = {
  id: string;
  name: string;
  platform: string | null;
  componentId: string | null;
};

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  project: SentryProject | null;
  components: Component[];
}

export function EditProjectModal({
  isOpen,
  onClose,
  onSuccess,
  project,
  components,
}: EditProjectModalProps) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateProject = useServerFn(updateSentryProjectFn);

  useEffect(() => {
    if (!isOpen || !project) return;
    setName(project.name);
    setPlatform(project.platform || "");
    setSelectedComponentId(project.componentId || "");
    setError(null);
  }, [isOpen, project]);

  const handleClose = () => {
    setError(null);
    setIsLoading(false);
    onClose();
  };

  const onEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) return;

    setError(null);
    setIsLoading(true);
    try {
      await updateProject({
        data: {
          projectId: project.id,
          name,
          platform: platform || null,
          componentId: selectedComponentId || null,
        },
      });
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Project">
      <form className="form" onSubmit={onEdit}>
        {error ? <div className="form-error">{error}</div> : null}

        <label htmlFor="edit-project-name">Project Name</label>
        <input
          id="edit-project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Application"
          required
          disabled={isLoading}
        />

        <label htmlFor="edit-project-platform">Platform</label>
        <PlatformSelect
          id="edit-project-platform"
          value={platform}
          onChange={setPlatform}
        />

        {components.length > 0 && (
          <>
            <label htmlFor="edit-project-component" className="mt-4">
              Linked component (optional)
            </label>
            <select
              id="edit-project-component"
              value={selectedComponentId}
              onChange={(e) => setSelectedComponentId(e.target.value)}
              disabled={isLoading}
              className="mt-2"
            >
              <option value="">No component</option>
              {components.map((component) => (
                <option key={component.id} value={component.id}>
                  {component.name}
                </option>
              ))}
            </select>
          </>
        )}

        <FormActions>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Changes"}
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
      </form>
    </Modal>
  );
}
