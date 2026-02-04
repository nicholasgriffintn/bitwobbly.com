import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { PlatformSelect } from "@/components/PlatformSelect";
import { createSentryProjectFn } from "@/server/functions/sentry";

type Component = { id: string; name: string };

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  onCreated: (data: {
    dsn: string;
    publicKey: string;
    secretKey: string | null;
  }) => void;
  components: Component[];
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onSuccess,
  onCreated,
  components,
}: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProject = useServerFn(createSentryProjectFn);

  const handleClose = () => {
    setName("");
    setPlatform("");
    setSelectedComponentId("");
    setError(null);
    setIsLoading(false);
    onClose();
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const result = await createProject({
        data: {
          name,
          platform: platform || undefined,
          componentId: selectedComponentId || undefined,
        },
      });

      onCreated({
        publicKey: result.publicKey,
        secretKey: result.secretKey,
        dsn: `https://${result.publicKey}@ingest.bitwobbly.com/${result.sentryProjectId}`,
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Project">
      <form className="form" onSubmit={onCreate}>
        {error ? <div className="form-error">{error}</div> : null}

        <label htmlFor="project-name">Project Name</label>
        <input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Application"
          required
          disabled={isLoading}
        />

        <label htmlFor="project-platform">Platform</label>
        <PlatformSelect
          id="project-platform"
          value={platform}
          onChange={setPlatform}
        />

        {components.length > 0 && (
          <>
            <label htmlFor="project-component" className="mt-4">
              Linked component (optional)
            </label>
            <select
              id="project-component"
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
            {isLoading ? "Creating..." : "Create Project"}
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

