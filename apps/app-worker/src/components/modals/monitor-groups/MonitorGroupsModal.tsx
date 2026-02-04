import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import {
  createMonitorGroupFn,
  deleteMonitorGroupFn,
} from "@/server/functions/monitor-groups";

type MonitorGroup = {
  id: string;
  name: string;
  description: string | null;
};

interface MonitorGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: MonitorGroup[];
  onSuccess: () => Promise<void>;
}

export function MonitorGroupsModal({
  isOpen,
  onClose,
  groups,
  onSuccess,
}: MonitorGroupsModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const createGroup = useServerFn(createMonitorGroupFn);
  const deleteGroup = useServerFn(deleteMonitorGroupFn);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsWorking(false);
  }, [isOpen]);

  const refresh = async () => {
    await onSuccess();
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsWorking(true);
    try {
      await createGroup({
        data: {
          name,
          description: description.trim() ? description.trim() : null,
        },
      });
      setName("");
      setDescription("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWorking(false);
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    setIsWorking(true);
    try {
      await deleteGroup({ data: { id } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Monitor groups">
      {error ? <div className="form-error">{error}</div> : null}

      <form className="form" onSubmit={onCreate}>
        <label htmlFor="group-name">Name</label>
        <input
          id="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Payments"
          required
          disabled={isWorking}
        />

        <label htmlFor="group-description">Description (optional)</label>
        <input
          id="group-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Monitors covering checkout/payment pipeline"
          disabled={isWorking}
        />

        <div className="button-row">
          <button type="submit" disabled={isWorking}>
            Create group
          </button>
        </div>
      </form>

      <div className="mt-6">
        <div className="mb-2 text-sm font-semibold">Existing groups</div>
        {groups.length ? (
          <div className="space-y-2">
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{g.name}</div>
                  <div className="muted truncate text-xs">
                    {g.description || "No description"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  color="danger"
                  onClick={() => onDelete(g.id)}
                  disabled={isWorking}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted text-sm">No groups yet.</p>
        )}
      </div>
    </Modal>
  );
}
