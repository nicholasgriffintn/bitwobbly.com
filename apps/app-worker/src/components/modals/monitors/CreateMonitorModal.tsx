import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { createMonitorFn } from "@/server/functions/monitors";
import { configHelp, validateJsonConfig } from "./monitorConfig";

interface CreateMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  groups: Array<{ id: string; name: string }>;
}

export function CreateMonitorModal({
  isOpen,
  onClose,
  onSuccess,
  groups,
}: CreateMonitorModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [interval, setInterval] = useState("60");
  const [timeout, setTimeout] = useState("8000");
  const [threshold, setThreshold] = useState("3");
  const [monitorType, setMonitorType] = useState("http");
  const [externalServiceType, setExternalServiceType] = useState("");
  const [checkConfig, setCheckConfig] = useState("");
  const [checkConfigError, setCheckConfigError] = useState<string | null>(null);

  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [createdMonitorId, setCreatedMonitorId] = useState<string | null>(null);
  const [createdTokenType, setCreatedTokenType] = useState<string | null>(null);

  const createMonitor = useServerFn(createMonitorFn);

  const handleClose = () => {
    setError(null);
    setWebhookToken(null);
    setCreatedMonitorId(null);
    setCreatedTokenType(null);
    setName("");
    setUrl("");
    setGroupId(null);
    setInterval("60");
    setTimeout("8000");
    setThreshold("3");
    setMonitorType("http");
    setExternalServiceType("");
    setCheckConfig("");
    setCheckConfigError(null);
    onClose();
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (checkConfigError) {
        throw new Error("Config JSON is invalid");
      }

      const externalConfig =
        monitorType === "external" && externalServiceType
          ? JSON.stringify({ serviceType: externalServiceType })
          : checkConfig.trim()
            ? checkConfig.trim()
            : undefined;

      const result = await createMonitor({
        data: {
          name,
          group_id: groupId,
          url:
            monitorType === "webhook" ||
            monitorType === "manual" ||
            monitorType === "heartbeat"
              ? undefined
              : url || undefined,
          interval_seconds: Number(interval),
          timeout_ms: Number(timeout),
          failure_threshold: Number(threshold),
          type: monitorType,
          external_config: externalConfig,
        },
      });

      if (result.webhookToken) {
        setWebhookToken(result.webhookToken);
        setCreatedMonitorId(result.id);
        setCreatedTokenType(monitorType);
        return;
      }

      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Monitor">
      {error ? <div className="form-error">{error}</div> : null}

      {webhookToken ? (
        <div className="form">
          <div className="mb-4 rounded border-2 border-green-600 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-base font-semibold text-green-600">
              <span>✓</span>
              Webhook Monitor Created
            </div>
            <p className="mb-4 rounded border border-amber-400 bg-amber-100 p-2 text-sm text-amber-800">
              <strong>⚠️</strong> Save this webhook URL and token securely. You
              will not be able to see it again.
            </p>

            <div className="mb-3">
              <label className="text-sm font-semibold">
                {createdTokenType === "heartbeat" ? "Heartbeat URL" : "Webhook URL"}
              </label>
              <input
                readOnly
                value={`${window.location.origin}/api/${
                  createdTokenType === "heartbeat" ? "heartbeats" : "webhooks"
                }/${createdMonitorId}`}
                onClick={(e) => e.currentTarget.select()}
                className="w-full cursor-pointer font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-sm font-semibold">Token</label>
              <input
                readOnly
                value={webhookToken}
                onClick={(e) => e.currentTarget.select()}
                className="w-full cursor-pointer font-mono text-xs"
              />
              <p className="muted mt-2 text-xs">
                POST to the URL with JSON:{" "}
                {createdTokenType === "heartbeat"
                  ? `{ "token": "...", "message": "..." }`
                  : `{ "token": "...", "status": "up|down|degraded", "message": "..." }`}
              </p>
            </div>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button-success"
              onClick={async () => {
                await onSuccess();
                handleClose();
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="form" onSubmit={onCreate}>
          <label htmlFor="monitor-type">Monitor Type</label>
          <select
            id="monitor-type"
            value={monitorType}
            onChange={(e) => {
              setMonitorType(e.target.value);
              setCheckConfigError(validateJsonConfig(checkConfig));
            }}
          >
            <option value="http">HTTP</option>
            <option value="http_assert">HTTP (Assertions)</option>
            <option value="http_keyword">HTTP (Keyword match)</option>
            <option value="tls">TLS</option>
            <option value="dns">DNS</option>
            <option value="tcp">TCP</option>
            <option value="heartbeat">Cron heartbeat</option>
            <option value="webhook">Webhook</option>
            <option value="external">External Service</option>
            <option value="manual">Manual</option>
          </select>

          <label htmlFor="monitor-name">Name</label>
          <input
            id="monitor-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="API gateway"
            required
          />

          <label htmlFor="monitor-group">Monitor group</label>
          <select
            id="monitor-group"
            value={groupId || ""}
            onChange={(e) => setGroupId(e.target.value || null)}
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          {(monitorType === "http" ||
            monitorType === "http_assert" ||
            monitorType === "http_keyword") && (
            <>
              <label htmlFor="monitor-url">URL</label>
              <input
                id="monitor-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/health"
                required
              />
            </>
          )}

          {(monitorType === "tls" || monitorType === "dns" || monitorType === "tcp") && (
            <>
              <label htmlFor="monitor-url">Target</label>
              <input
                id="monitor-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={monitorType === "dns" ? "example.com" : "example.com:443"}
                required
              />
            </>
          )}

          {monitorType === "webhook" && (
            <p className="muted">
              A webhook token will be generated. External services will push status
              updates to your webhook endpoint.
            </p>
          )}

          {monitorType === "heartbeat" && (
            <p className="muted">
              A token will be generated. Your cron will POST check-ins to your heartbeat
              endpoint. Missing check-ins will mark the monitor down.
            </p>
          )}

          {monitorType === "external" && (
            <>
              <label htmlFor="monitor-url">Status URL</label>
              <input
                id="monitor-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://status.example.com/api"
                required
              />
            </>
          )}

          {monitorType === "external" && (
            <>
              <label htmlFor="external-service">Service Type</label>
              <select
                id="external-service"
                value={externalServiceType}
                onChange={(e) => setExternalServiceType(e.target.value)}
                required
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

          {monitorType !== "http" &&
            monitorType !== "webhook" &&
            monitorType !== "external" &&
            monitorType !== "manual" &&
            monitorType !== "heartbeat" && (
              <>
                <label htmlFor="monitor-config">Config (JSON)</label>
                <p className="muted -mt-1">Optional. Leave blank to use defaults.</p>
                <textarea
                  id="monitor-config"
                  value={checkConfig}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCheckConfig(value);
                    setCheckConfigError(validateJsonConfig(value));
                  }}
                  rows={4}
                />
                {checkConfigError ? <p className="text-red-600">{checkConfigError}</p> : null}
                {(() => {
                  const help = configHelp(monitorType);
                  if (!help) return null;
                  return (
                    <details className="mt-2 rounded bg-light p-2">
                      <summary className="muted cursor-pointer select-none">
                        {help.title} config help
                      </summary>
                      <p className="muted mt-2">{help.description}</p>
                      <div className="mt-2">
                        <div className="muted mb-1">Example</div>
                        <pre className="m-0 whitespace-pre-wrap">{help.example}</pre>
                      </div>
                      <div className="mt-2">
                        <div className="muted mb-1">Schema</div>
                        <pre className="m-0 whitespace-pre-wrap">{help.schema}</pre>
                      </div>
                    </details>
                  );
                })()}
              </>
            )}

          {monitorType === "heartbeat" && (
            <>
              <label htmlFor="monitor-config">Config (JSON)</label>
              <p className="muted -mt-1">Optional. Leave blank to use defaults.</p>
              <textarea
                id="monitor-config"
                value={checkConfig}
                onChange={(event) => {
                  const value = event.target.value;
                  setCheckConfig(value);
                  setCheckConfigError(validateJsonConfig(value));
                }}
                rows={3}
              />
              {checkConfigError ? <p className="text-red-600">{checkConfigError}</p> : null}
              {(() => {
                const help = configHelp("heartbeat");
                if (!help) return null;
                return (
                  <details className="mt-2">
                    <summary className="muted cursor-pointer select-none">
                      {help.title} config help
                    </summary>
                    <p className="muted mt-2">{help.description}</p>
                    <div className="mt-2">
                      <div className="muted mb-1">Example</div>
                      <pre className="m-0 whitespace-pre-wrap">{help.example}</pre>
                    </div>
                    <div className="mt-2">
                      <div className="muted mb-1">Schema</div>
                      <pre className="m-0 whitespace-pre-wrap">{help.schema}</pre>
                    </div>
                  </details>
                );
              })()}
            </>
          )}

          {monitorType === "manual" && (
            <p className="muted">
              Manual monitors require you to set the status manually from the monitor list.
            </p>
          )}

          {monitorType !== "webhook" && monitorType !== "manual" && (
            <div className="grid three">
              <div>
                <label htmlFor="monitor-interval">Interval (sec)</label>
                <input
                  id="monitor-interval"
                  type="number"
                  min="30"
                  max="3600"
                  value={interval}
                  onChange={(event) => setInterval(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="monitor-timeout">Timeout (ms)</label>
                <input
                  id="monitor-timeout"
                  type="number"
                  min="1000"
                  max="30000"
                  value={timeout}
                  onChange={(event) => setTimeout(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="monitor-threshold">Failure threshold</label>
                <input
                  id="monitor-threshold"
                  type="number"
                  min="1"
                  max="10"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
              </div>
            </div>
          )}

          <div className="button-row mt-4">
            <button type="submit">Create Monitor</button>
            <button type="button" className="outline" onClick={handleClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
