import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { updateMonitorFn } from "@/server/functions/monitors";
import { configHelp, validateJsonConfig } from "./monitorConfig";

type Monitor = {
  id: string;
  name: string;
  url: string | null;
  groupId?: string | null;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  enabled: number;
  type: string;
  externalConfig?: string | null;
};

interface EditMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  monitor: Monitor | null;
  groups: Array<{ id: string; name: string }>;
}

export function EditMonitorModal({
  isOpen,
  onClose,
  onSuccess,
  monitor,
  groups,
}: EditMonitorModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [editingMonitorType, setEditingMonitorType] = useState("http");
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editInterval, setEditInterval] = useState("");
  const [editTimeout, setEditTimeout] = useState("");
  const [editThreshold, setEditThreshold] = useState("");
  const [editExternalServiceType, setEditExternalServiceType] = useState("");
  const [editCheckConfig, setEditCheckConfig] = useState("");
  const [editCheckConfigError, setEditCheckConfigError] = useState<
    string | null
  >(null);

  const updateMonitor = useServerFn(updateMonitorFn);

  useEffect(() => {
    if (!isOpen || !monitor) return;

    setError(null);
    setEditingMonitorType(monitor.type);
    setEditName(monitor.name);
    setEditUrl(monitor.url || "");
    setEditGroupId(monitor.groupId || null);
    setEditInterval(String(monitor.intervalSeconds));
    setEditTimeout(String(monitor.timeoutMs));
    setEditThreshold(String(monitor.failureThreshold));
    setEditCheckConfigError(null);

    if (monitor.externalConfig) {
      if (monitor.type === "external") {
        try {
          const config = JSON.parse(monitor.externalConfig);
          setEditExternalServiceType(config.serviceType || "");
          setEditCheckConfig("");
        } catch {
          setEditExternalServiceType("");
          setEditCheckConfig("");
        }
      } else {
        setEditCheckConfig(monitor.externalConfig);
        setEditCheckConfigError(validateJsonConfig(monitor.externalConfig));
        setEditExternalServiceType("");
      }
    } else {
      setEditExternalServiceType("");
      setEditCheckConfig("");
    }
  }, [isOpen, monitor]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const onUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!monitor) return;

    setError(null);
    try {
      if (editCheckConfigError) {
        throw new Error("Config JSON is invalid");
      }

      const externalConfig =
        editingMonitorType === "external" && editExternalServiceType
          ? JSON.stringify({ serviceType: editExternalServiceType })
          : editCheckConfig.trim()
            ? editCheckConfig.trim()
            : undefined;

      await updateMonitor({
        data: {
          id: monitor.id,
          name: editName,
          group_id: editGroupId,
          url:
            editingMonitorType === "webhook" ||
            editingMonitorType === "manual" ||
            editingMonitorType === "heartbeat"
              ? undefined
              : editUrl || undefined,
          interval_seconds: Number(editInterval),
          timeout_ms: Number(editTimeout),
          failure_threshold: Number(editThreshold),
          type: editingMonitorType,
          external_config: externalConfig,
        },
      });

      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Monitor">
      {error ? <div className="form-error">{error}</div> : null}

      <form className="form" onSubmit={onUpdate}>
        <label htmlFor="edit-name">Name</label>
        <input
          id="edit-name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          required
        />

        <label htmlFor="edit-group">Monitor group</label>
        <select
          id="edit-group"
          value={editGroupId || ""}
          onChange={(e) => setEditGroupId(e.target.value || null)}
        >
          <option value="">No group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        {editingMonitorType !== "webhook" &&
          editingMonitorType !== "manual" &&
          editingMonitorType !== "heartbeat" && (
            <>
              <label htmlFor="edit-url">
                {editingMonitorType === "dns" ||
                editingMonitorType === "tcp" ||
                editingMonitorType === "ping" ||
                editingMonitorType === "tls"
                  ? "Target"
                  : "URL"}
              </label>
              <input
                id="edit-url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                required
              />
            </>
          )}

        {editingMonitorType === "external" && (
          <>
            <label htmlFor="edit-external-service">Service Type</label>
            <select
              id="edit-external-service"
              value={editExternalServiceType}
              onChange={(e) => setEditExternalServiceType(e.target.value)}
            >
              <option value="">Select a service...</option>
              <option value="cloudflare-workers">Cloudflare Workers</option>
              <option value="cloudflare-d1">Cloudflare D1</option>
              <option value="cloudflare-r2">Cloudflare R2</option>
              <option value="cloudflare-kv">Cloudflare KV</option>
              <option value="custom">Custom Status Page</option>
            </select>
          </>
        )}

        {editingMonitorType !== "http" &&
          editingMonitorType !== "webhook" &&
          editingMonitorType !== "external" &&
          editingMonitorType !== "manual" && (
            <>
              <label htmlFor="edit-config">Config (JSON)</label>
              <p className="muted -mt-1">
                Optional. Leave blank to use defaults.
              </p>
              <textarea
                id="edit-config"
                value={editCheckConfig}
                onChange={(e) => {
                  const value = e.target.value;
                  setEditCheckConfig(value);
                  setEditCheckConfigError(validateJsonConfig(value));
                }}
                rows={4}
              />
              {editCheckConfigError ? (
                <p className="text-red-600">{editCheckConfigError}</p>
              ) : null}
              {(() => {
                const help = configHelp(editingMonitorType);
                if (!help) return null;
                return (
                  <details className="mt-2">
                    <summary className="muted cursor-pointer select-none">
                      {help.title} config help
                    </summary>
                    <p className="muted mt-2">{help.description}</p>
                    <div className="mt-2">
                      <div className="muted mb-1">Example</div>
                      <pre className="m-0 whitespace-pre-wrap">
                        {help.example}
                      </pre>
                    </div>
                    <div className="mt-2">
                      <div className="muted mb-1">Schema</div>
                      <pre className="m-0 whitespace-pre-wrap">
                        {help.schema}
                      </pre>
                    </div>
                  </details>
                );
              })()}
            </>
          )}

        {editingMonitorType !== "webhook" &&
          editingMonitorType !== "manual" && (
            <div className="grid three">
              <div>
                <label htmlFor="edit-interval">Interval (sec)</label>
                <input
                  id="edit-interval"
                  type="number"
                  min="30"
                  max="3600"
                  value={editInterval}
                  onChange={(e) => setEditInterval(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="edit-timeout">Timeout (ms)</label>
                <input
                  id="edit-timeout"
                  type="number"
                  min="1000"
                  max="30000"
                  value={editTimeout}
                  onChange={(e) => setEditTimeout(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="edit-threshold">Failure threshold</label>
                <input
                  id="edit-threshold"
                  type="number"
                  min="1"
                  max="10"
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(e.target.value)}
                />
              </div>
            </div>
          )}

        <div className="button-row mt-4">
          <button type="submit">Save Changes</button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
