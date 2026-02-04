import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { createSuppressionFn } from "@/server/functions/suppressions";

type Monitor = { id: string; name: string };
type MonitorGroup = { id: string; name: string };
type Component = { id: string; name: string };

type ScopeType = "monitor" | "monitor_group" | "component";
type Kind = "maintenance" | "silence";

interface CreateSuppressionModalProps {
  isOpen: boolean;
  onClose: () => void;
  monitors: Monitor[];
  groups: MonitorGroup[];
  components: Component[];
  onSuccess: () => Promise<void>;
}

export function CreateSuppressionModal({
  isOpen,
  onClose,
  monitors,
  groups,
  components,
  onSuccess,
}: CreateSuppressionModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("maintenance");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("monitor");
  const [scopeId, setScopeId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const createSuppression = useServerFn(createSuppressionFn);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setKind("maintenance");
    setName("");
    setReason("");
    setScopeType("monitor");
    setScopeId("");
    setStartsAt("");
    setEndsAt("");
  }, [isOpen]);

  const scopeOptions = useMemo(() => {
    if (scopeType === "monitor") return monitors.map((m) => ({ id: m.id, label: m.name }));
    if (scopeType === "monitor_group") return groups.map((g) => ({ id: g.id, label: g.name }));
    return components.map((c) => ({ id: c.id, label: c.name }));
  }, [components, groups, monitors, scopeType]);

  const toSec = (value: string) => {
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms)) return null;
    return Math.floor(ms / 1000);
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const startSec = toSec(startsAt);
      const endSec = endsAt ? toSec(endsAt) : null;

      if (!startSec) throw new Error("Start time is required");
      if (!scopeId) throw new Error("Scope is required");

      await createSuppression({
        data: {
          kind,
          name,
          reason: reason.trim() ? reason.trim() : undefined,
          starts_at: startSec,
          ends_at: endSec,
          scopes: [{ scope_type: scopeType, scope_id: scopeId }],
        },
      });

      await onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create maintenance or silence">
      {error ? <div className="form-error">{error}</div> : null}

      <form className="form" onSubmit={onCreate}>
        <label htmlFor="kind">Type</label>
        <select
          id="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value === "silence" ? "silence" : "maintenance")}
        >
          <option value="maintenance">Maintenance window</option>
          <option value="silence">Alert silence</option>
        </select>

        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "maintenance" ? "Database upgrade" : "Noise suppression"}
          required
        />

        <label htmlFor="reason">Reason (optional)</label>
        <input
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Planned work"
        />

        <label htmlFor="scope-type">Scope type</label>
        <select
          id="scope-type"
          value={scopeType}
          onChange={(e) => {
            const next =
              e.target.value === "component"
                ? "component"
                : e.target.value === "monitor_group"
                  ? "monitor_group"
                  : "monitor";
            setScopeType(next);
            setScopeId("");
          }}
        >
          <option value="monitor">Monitor</option>
          <option value="monitor_group">Monitor group</option>
          <option value="component">Component</option>
        </select>

        <label htmlFor="scope">Scope</label>
        <select id="scope" value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
          <option value="">Select…</option>
          {scopeOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>

        <label htmlFor="starts">Starts (local time)</label>
        <input
          id="starts"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />

        <label htmlFor="ends">Ends (local time){kind === "maintenance" ? "" : " (optional)"}</label>
        <input
          id="ends"
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          required={kind === "maintenance"}
        />

        <div className="button-row">
          <button type="submit">Create</button>
        </div>
      </form>
    </Modal>
  );
}

