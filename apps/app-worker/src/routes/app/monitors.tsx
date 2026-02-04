import React, { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { MetricsChart } from "@/components/MetricsChart";
import { Modal } from "@/components/Modal";
import { toTitleCase } from '@/utils/format';
import {
  listMonitorsFn,
  createMonitorFn,
  deleteMonitorFn,
  updateMonitorFn,
  triggerSchedulerFn,
  setManualMonitorStatusFn,
} from "@/server/functions/monitors";

type Monitor = {
  id: string;
  name: string;
  url: string | null;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  enabled: number;
  type: string;
  webhookToken?: string | null;
  externalConfig?: string | null;
  state?: { lastStatus?: string; lastLatencyMs?: number | null } | null;
};

export const Route = createFileRoute("/app/monitors")({
  component: Monitors,
  loader: async () => {
    const monitors = await listMonitorsFn();
    return { monitors: monitors.monitors };
  },
});

function Monitors() {
  const { monitors: initialMonitors } = Route.useLoaderData();

  const [monitors, setMonitors] = useState<Monitor[]>(initialMonitors);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [interval, setInterval] = useState("60");
  const [timeout, setTimeout] = useState("8000");
  const [threshold, setThreshold] = useState("3");
  const [monitorType, setMonitorType] = useState("http");
  const [externalServiceType, setExternalServiceType] = useState("");
  const [checkConfig, setCheckConfig] = useState('');
  const [checkConfigError, setCheckConfigError] = useState<string | null>(null);
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [createdMonitorId, setCreatedMonitorId] = useState<string | null>(null);
  const [createdTokenType, setCreatedTokenType] = useState<string | null>(null);
  const [expandedMonitorId, setExpandedMonitorId] = useState<string | null>(
    null,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMonitorId, setEditingMonitorId] = useState<string | null>(null);
  const [editingMonitorType, setEditingMonitorType] = useState("http");
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editInterval, setEditInterval] = useState("");
  const [editTimeout, setEditTimeout] = useState("");
  const [editThreshold, setEditThreshold] = useState("");
  const [editExternalServiceType, setEditExternalServiceType] = useState("");
  const [editCheckConfig, setEditCheckConfig] = useState('');
  const [editCheckConfigError, setEditCheckConfigError] = useState<
    string | null
  >(null);
  const [isManualStatusModalOpen, setIsManualStatusModalOpen] = useState(false);
  const [manualStatusMonitorId, setManualStatusMonitorId] = useState<
    string | null
  >(null);
  const [manualStatus, setManualStatus] = useState("up");
  const [manualMessage, setManualMessage] = useState("");

  const createMonitor = useServerFn(createMonitorFn);
  const deleteMonitor = useServerFn(deleteMonitorFn);
  const updateMonitor = useServerFn(updateMonitorFn);
  const listMonitors = useServerFn(listMonitorsFn);
  const triggerScheduler = useServerFn(triggerSchedulerFn);
  const setManualMonitorStatus = useServerFn(setManualMonitorStatusFn);

  const refreshMonitors = async () => {
    try {
      const res = await listMonitors();
      setMonitors(res.monitors);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (checkConfigError) {
        throw new Error('Config JSON is invalid');
      }

      const externalConfig =
        monitorType === 'external' && externalServiceType
          ? JSON.stringify({ serviceType: externalServiceType })
          : checkConfig.trim()
            ? checkConfig.trim()
            : undefined;

      const result = await createMonitor({
        data: {
          name,
          url:
            monitorType === 'webhook' ||
            monitorType === 'manual' ||
            monitorType === 'heartbeat'
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
      } else {
        await refreshMonitors();
        closeCreateModal();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setWebhookToken(null);
    setCreatedMonitorId(null);
    setCreatedTokenType(null);
    setName("");
    setUrl("");
    setInterval("60");
    setTimeout("8000");
    setThreshold("3");
    setMonitorType("http");
    setExternalServiceType("");
    setCheckConfig('');
    setCheckConfigError(null);
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteMonitor({ data: { id } });
      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const startEditing = (monitor: Monitor) => {
    setEditingMonitorId(monitor.id);
    setEditingMonitorType(monitor.type);
    setEditName(monitor.name);
    setEditUrl(monitor.url || "");
    setEditInterval(String(monitor.intervalSeconds));
    setEditTimeout(String(monitor.timeoutMs));
    setEditThreshold(String(monitor.failureThreshold));
    setEditCheckConfigError(null);
    if (monitor.externalConfig) {
      if (monitor.type === 'external') {
        try {
          const config = JSON.parse(monitor.externalConfig);
          setEditExternalServiceType(config.serviceType || '');
          setEditCheckConfig('');
        } catch {
          setEditExternalServiceType('');
          setEditCheckConfig('');
        }
      } else {
        setEditCheckConfig(monitor.externalConfig);
        try {
          JSON.parse(monitor.externalConfig);
        } catch {
          setEditCheckConfigError('Invalid JSON');
        }
      }
    } else {
      setEditExternalServiceType('');
      setEditCheckConfig('');
    }
    setIsEditModalOpen(true);
  };

  const cancelEditing = () => {
    setEditingMonitorId(null);
    setIsEditModalOpen(false);
  };

  const onUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingMonitorId) return;
    setError(null);
    try {
      if (editCheckConfigError) {
        throw new Error('Config JSON is invalid');
      }

      const externalConfig =
        editingMonitorType === 'external' && editExternalServiceType
          ? JSON.stringify({ serviceType: editExternalServiceType })
          : editCheckConfig.trim()
            ? editCheckConfig.trim()
            : undefined;

      await updateMonitor({
        data: {
          id: editingMonitorId,
          name: editName,
          url:
            editingMonitorType === 'webhook' ||
            editingMonitorType === 'manual' ||
            editingMonitorType === 'heartbeat'
              ? undefined
              : editUrl || undefined,
          interval_seconds: Number(editInterval),
          timeout_ms: Number(editTimeout),
          failure_threshold: Number(editThreshold),
          type: editingMonitorType,
          external_config: externalConfig,
        },
      });
      await refreshMonitors();
      setEditingMonitorId(null);
      setIsEditModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openManualStatusModal = (monitorId: string) => {
    setManualStatusMonitorId(monitorId);
    setManualStatus("up");
    setManualMessage("");
    setIsManualStatusModalOpen(true);
  };

  const onSetManualStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!manualStatusMonitorId) return;
    setError(null);
    try {
      await setManualMonitorStatus({
        data: {
          monitorId: manualStatusMonitorId,
          status: manualStatus,
          message: manualMessage || undefined,
        },
      });
      await refreshMonitors();
      setIsManualStatusModalOpen(false);
      setManualStatusMonitorId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleEnabled = async (monitor: Monitor) => {
    setError(null);
    try {
      await updateMonitor({
        data: {
          id: monitor.id,
          enabled: monitor.enabled ? 0 : 1,
        },
      });
      await refreshMonitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onTriggerScheduler = async () => {
    setError(null);
    try {
      await triggerScheduler();
      window.setTimeout(refreshMonitors, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const configHelp = (type: string) => {
    if (type === 'http_assert') {
      return {
        title: 'HTTP assertions',
        description:
          'Assert expected status codes and optionally check the response body contains a string.',
        schema: `{
  "expectedStatus"?: number[],
  "bodyIncludes"?: string
}`,
        example: `{
  "expectedStatus": [200],
  "bodyIncludes": "ok"
}`,
      };
    }
    if (type === 'http_keyword') {
      return {
        title: 'Keyword match',
        description:
          'Fetch the URL and verify the response body contains a keyword.',
        schema: `{
  "keyword"?: string,
  "caseSensitive"?: boolean
}`,
        example: `{
  "keyword": "healthy",
  "caseSensitive": false
}`,
      };
    }
    if (type === 'tls') {
      return {
        title: 'TLS expiry',
        description:
          'Fail if the certificate expires too soon. Optional allowInvalid skips CA validation (not recommended).',
        schema: `{
  "minDaysRemaining"?: number,
  "allowInvalid"?: boolean
}`,
        example: `{
  "minDaysRemaining": 14,
  "allowInvalid": false
}`,
      };
    }
    if (type === 'dns') {
      return {
        title: 'DNS',
        description:
          'Resolve via DNS-over-HTTPS and optionally require an answer containing a substring.',
        schema: `{
  "recordType"?: "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "NS",
  "expectedIncludes"?: string
}`,
        example: `{
  "recordType": "A",
  "expectedIncludes": "1.2.3.4"
}`,
      };
    }
    if (type === 'heartbeat') {
      return {
        title: 'Cron heartbeat',
        description:
          'Check-ins are POSTed to the heartbeat URL. If no check-in arrives within interval + grace, the monitor goes down.',
        schema: `{
  "graceSeconds"?: number
}`,
        example: `{
  "graceSeconds": 30
}`,
      };
    }
    return null;
  };

  const validateJsonConfig = (value: string) => {
    if (!value.trim()) return null;
    try {
      JSON.parse(value);
      return null;
    } catch {
      return 'Invalid JSON';
    }
  };

  return (
    <div className="page page-stack">
      <div className="page-header">
        <div>
          <h2>Monitors</h2>
          <p>Track availability, latency, and incident thresholds.</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)}>
          Create Monitor
        </button>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div className="card-title flex flex-wrap items-center gap-4">
          Monitors
          <button
            type="button"
            className="outline button-info ml-auto px-3 py-1 text-sm"
            onClick={onTriggerScheduler}
            title="Manually trigger monitor checks (dev mode)"
          >
            Check Now
          </button>
        </div>
        <div className="list">
          {monitors.length ? (
            monitors.map((monitor) => (
              <React.Fragment key={monitor.id}>
                <div className="list-item-expanded">
                  <div className="list-row">
                    <div className="flex-1">
                      <div className="list-title">
                        {monitor.name}
                        {!monitor.enabled && (
                          <span className="pill small ml-2">
                            Paused
                          </span>
                        )}
                      </div>
                      {monitor.url && (
                        <div className="muted">{monitor.url}</div>
                      )}
                      <div className="muted mt-1">
                        <span
                          className={`status ${monitor.state?.lastStatus || 'unknown'}`}
                        >
                          {toTitleCase(monitor.state?.lastStatus || 'unknown')}
                        </span>
                        {' · '}
                        <span className="pill small">
                          {toTitleCase(monitor.type)}
                        </span>
                        {monitor.type !== 'webhook' &&
                          monitor.type !== 'manual' && (
                            <>
                              {' · '}
                              {monitor.intervalSeconds}s interval ·{' '}
                              {monitor.timeoutMs}ms timeout ·{' '}
                              {monitor.failureThreshold} failures
                            </>
                          )}
                      </div>
                    </div>
                    <div className="button-row">
                      {monitor.type !== 'webhook' &&
                        monitor.type !== 'manual' && (
                          <button
                            type="button"
                            className="outline"
                            onClick={() =>
                              setExpandedMonitorId(
                                expandedMonitorId === monitor.id
                                  ? null
                                  : monitor.id,
                              )
                            }
                          >
                            {expandedMonitorId === monitor.id
                              ? 'Hide'
                              : 'Metrics'}
                          </button>
                        )}
                      {monitor.type === 'manual' && (
                        <button
                          type="button"
                          className="outline"
                          onClick={() => openManualStatusModal(monitor.id)}
                        >
                          Set Status
                        </button>
                      )}
                      <button
                        type="button"
                        className="outline"
                        onClick={() => startEditing(monitor)}
                      >
                        Edit
                      </button>
                      {monitor.type !== 'webhook' &&
                        monitor.type !== 'manual' && (
                          <button
                            type="button"
                            className={`outline ${monitor.enabled ? 'button-warning' : 'button-success'}`}
                            onClick={() => toggleEnabled(monitor)}
                          >
                            {monitor.enabled ? 'Pause' : 'Resume'}
                          </button>
                        )}
                      <button
                        type="button"
                        className="outline button-danger"
                        onClick={() => onDelete(monitor.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {expandedMonitorId === monitor.id && (
                    <div className="mt-4">
                      <MetricsChart monitorId={monitor.id} />
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))
          ) : (
            <div className="muted">No monitors configured.</div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        title="Create Monitor"
      >
        {webhookToken ? (
          <div className="form">
            <div className="mb-4 rounded border-2 border-green-600 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-base font-semibold text-green-600">
                <span>✓</span>
                Webhook Monitor Created
              </div>
              <p className="mb-4 rounded border border-amber-400 bg-amber-100 p-2 text-sm text-amber-800">
                <strong>⚠️</strong> Save this webhook URL and token securely.
                You will not be able to see it again.
              </p>

              <div className="mb-3">
                <label className="text-sm font-semibold">
                  {createdTokenType === 'heartbeat'
                    ? 'Heartbeat URL'
                    : 'Webhook URL'}
                </label>
                <input
                  readOnly
                  value={`${window.location.origin}/api/${
                    createdTokenType === 'heartbeat' ? 'heartbeats' : 'webhooks'
                  }/${createdMonitorId}`}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full cursor-pointer font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">
                  Token
                </label>
                <input
                  readOnly
                  value={webhookToken}
                  onClick={(e) => e.currentTarget.select()}
                  className="w-full cursor-pointer font-mono text-xs"
                />
                <p className="muted mt-2 text-xs">
                  POST to the URL with JSON:{' '}
                  {createdTokenType === 'heartbeat'
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
                  await refreshMonitors();
                  closeCreateModal();
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

            {(monitorType === 'http' ||
              monitorType === 'http_assert' ||
              monitorType === 'http_keyword') && (
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

            {(monitorType === 'tls' ||
              monitorType === 'dns' ||
              monitorType === 'tcp') && (
              <>
                <label htmlFor="monitor-url">Target</label>
                <input
                  id="monitor-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={
                    monitorType === 'dns' ? 'example.com' : 'example.com:443'
                  }
                  required
                />
              </>
            )}

            {monitorType === 'webhook' && (
              <p className="muted">
                A webhook token will be generated. External services will push
                status updates to your webhook endpoint.
              </p>
            )}

            {monitorType === 'heartbeat' && (
              <p className="muted">
                A token will be generated. Your cron will POST check-ins to your
                heartbeat endpoint. Missing check-ins will mark the monitor
                down.
              </p>
            )}

            {monitorType === 'external' && (
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

            {monitorType === 'external' && (
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

            {monitorType !== 'http' &&
              monitorType !== 'webhook' &&
              monitorType !== 'external' &&
              monitorType !== 'manual' &&
              monitorType !== 'heartbeat' && (
                <>
                  <label htmlFor="monitor-config">Config (JSON)</label>
                  <p className="muted -mt-1">
                    Optional. Leave blank to use defaults.
                  </p>
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
                        <p className="muted mt-2">
                          {help.description}
                        </p>
                        <div className="mt-2">
                          <div className="muted mb-1">
                            Example
                          </div>
                          <pre className="m-0 whitespace-pre-wrap">
                            {help.example}
                          </pre>
                        </div>
                        <div className="mt-2">
                          <div className="muted mb-1">
                            Schema
                          </div>
                          <pre className="m-0 whitespace-pre-wrap">
                            {help.schema}
                          </pre>
                        </div>
                      </details>
                    );
                  })()}
                </>
              )}

            {monitorType === 'heartbeat' && (
              <>
                <label htmlFor="monitor-config">Config (JSON)</label>
                <p className="muted -mt-1">
                  Optional. Leave blank to use defaults.
                </p>
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
                  const help = configHelp('heartbeat');
                  if (!help) return null;
                  return (
                    <details className="mt-2">
                      <summary className="muted cursor-pointer select-none">
                        {help.title} config help
                      </summary>
                      <p className="muted mt-2">
                        {help.description}
                      </p>
                      <div className="mt-2">
                        <div className="muted mb-1">
                          Example
                        </div>
                        <pre className="m-0 whitespace-pre-wrap">
                          {help.example}
                        </pre>
                      </div>
                      <div className="mt-2">
                        <div className="muted mb-1">
                          Schema
                        </div>
                        <pre className="m-0 whitespace-pre-wrap">
                          {help.schema}
                        </pre>
                      </div>
                    </details>
                  );
                })()}
              </>
            )}

            {monitorType === 'manual' && (
              <p className="muted">
                Manual monitors require you to set the status manually from the
                monitor list.
              </p>
            )}

            {monitorType !== 'webhook' && monitorType !== 'manual' && (
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
              <button
                type="button"
                className="outline"
                onClick={closeCreateModal}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={cancelEditing}
        title="Edit Monitor"
      >
        <form className="form" onSubmit={onUpdate}>
          <label htmlFor="edit-name">Name</label>
          <input
            id="edit-name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />

          {editingMonitorType !== 'webhook' &&
            editingMonitorType !== 'manual' &&
            editingMonitorType !== 'heartbeat' && (
              <>
                <label htmlFor="edit-url">
                  {editingMonitorType === 'dns' ||
                  editingMonitorType === 'tcp' ||
                  editingMonitorType === 'ping' ||
                  editingMonitorType === 'tls'
                    ? 'Target'
                    : 'URL'}
                </label>
                <input
                  id="edit-url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  required
                />
              </>
            )}

          {editingMonitorType === 'external' && (
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

          {editingMonitorType !== 'http' &&
            editingMonitorType !== 'webhook' &&
            editingMonitorType !== 'external' &&
            editingMonitorType !== 'manual' && (
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
                {editCheckConfigError ? <p className="text-red-600">{editCheckConfigError}</p> : null}
                {(() => {
                  const help = configHelp(editingMonitorType);
                  if (!help) return null;
                  return (
                    <details className="mt-2">
                      <summary className="muted cursor-pointer select-none">
                        {help.title} config help
                      </summary>
                      <p className="muted mt-2">
                        {help.description}
                      </p>
                      <div className="mt-2">
                        <div className="muted mb-1">
                          Example
                        </div>
                        <pre className="m-0 whitespace-pre-wrap">
                          {help.example}
                        </pre>
                      </div>
                      <div className="mt-2">
                        <div className="muted mb-1">
                          Schema
                        </div>
                        <pre className="m-0 whitespace-pre-wrap">
                          {help.schema}
                        </pre>
                      </div>
                    </details>
                  );
                })()}
              </>
            )}

          {editingMonitorType !== 'webhook' &&
            editingMonitorType !== 'manual' && (
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
            <button type="button" className="outline" onClick={cancelEditing}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isManualStatusModalOpen}
        onClose={() => setIsManualStatusModalOpen(false)}
        title="Set Manual Status"
      >
        <form className="form" onSubmit={onSetManualStatus}>
          <label htmlFor="manual-status">Status</label>
          <select
            id="manual-status"
            value={manualStatus}
            onChange={(e) => setManualStatus(e.target.value)}
          >
            <option value="up">Up</option>
            <option value="down">Down</option>
            <option value="degraded">Degraded</option>
          </select>

          <label htmlFor="manual-message">Message (optional)</label>
          <input
            id="manual-message"
            value={manualMessage}
            onChange={(e) => setManualMessage(e.target.value)}
            placeholder="Optional status message"
          />

          <div className="button-row mt-4">
            <button type="submit">Update Status</button>
            <button
              type="button"
              className="outline"
              onClick={() => setIsManualStatusModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
