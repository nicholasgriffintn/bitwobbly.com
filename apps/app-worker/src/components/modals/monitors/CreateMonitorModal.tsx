import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { createMonitorFn } from "@/server/functions/monitors";
import { getMonitorEndpointUrl } from "@/utils/monitors";
import { MonitorForm, type MonitorFormValues } from "./MonitorForm";

interface CreateMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  groups: Array<{ id: string; name: string }>;
}

const DEFAULT_FORM_VALUES: MonitorFormValues = {
  name: "",
  url: "",
  groupId: null,
  interval: "60",
  timeout: "8000",
  threshold: "3",
  monitorType: "http",
  externalServiceType: "",
  checkConfig: "",
  checkConfigError: null,
};

export function CreateMonitorModal({
  isOpen,
  onClose,
  onSuccess,
  groups,
}: CreateMonitorModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] =
    useState<MonitorFormValues>(DEFAULT_FORM_VALUES);
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [createdMonitorId, setCreatedMonitorId] = useState<string | null>(null);
  const [createdTokenType, setCreatedTokenType] = useState<string | null>(null);

  const createMonitor = useServerFn(createMonitorFn);

  const handleClose = () => {
    setError(null);
    setWebhookToken(null);
    setCreatedMonitorId(null);
    setCreatedTokenType(null);
    setFormValues(DEFAULT_FORM_VALUES);
    onClose();
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (formValues.checkConfigError) {
        throw new Error("Config JSON is invalid");
      }

      const externalConfig =
        formValues.monitorType === "external" && formValues.externalServiceType
          ? JSON.stringify({ serviceType: formValues.externalServiceType })
          : formValues.checkConfig.trim()
            ? formValues.checkConfig.trim()
            : undefined;

      const noUrlTypes = ["webhook", "manual", "heartbeat"];
      const result = await createMonitor({
        data: {
          name: formValues.name,
          group_id: formValues.groupId,
          url: noUrlTypes.includes(formValues.monitorType)
            ? undefined
            : formValues.url || undefined,
          interval_seconds: Number(formValues.interval),
          timeout_ms: Number(formValues.timeout),
          failure_threshold: Number(formValues.threshold),
          type: formValues.monitorType,
          external_config: externalConfig,
        },
      });

      if (result.webhookToken) {
        setWebhookToken(result.webhookToken);
        setCreatedMonitorId(result.id);
        setCreatedTokenType(formValues.monitorType);
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

      {webhookToken && createdMonitorId && createdTokenType ? (
        <WebhookSuccessView
          webhookToken={webhookToken}
          monitorId={createdMonitorId}
          tokenType={createdTokenType}
          onDone={async () => {
            await onSuccess();
            handleClose();
          }}
        />
      ) : (
        <form className="form" onSubmit={onCreate}>
          <MonitorForm
            values={formValues}
            onChange={setFormValues}
            groups={groups}
            showTypeSelector={true}
            idPrefix="monitor"
          />

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

function WebhookSuccessView({
  webhookToken,
  monitorId,
  tokenType,
  onDone,
}: {
  webhookToken: string;
  monitorId: string;
  tokenType: string;
  onDone: () => Promise<void>;
}) {
  const isHeartbeat = tokenType === "heartbeat";

  return (
    <div className="form">
      <div className="mb-4 rounded border-2 border-green-600 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-base font-semibold text-green-600">
          <span>✓</span>
          {isHeartbeat ? "Heartbeat" : "Webhook"} Monitor Created
        </div>
        <p className="mb-4 rounded border border-amber-400 bg-amber-100 p-2 text-sm text-amber-800">
          <strong>⚠️</strong> Save this webhook URL and token securely. You will
          not be able to see it again.
        </p>

        <div className="mb-3">
          <label className="text-sm font-semibold">
            {isHeartbeat ? "Heartbeat URL" : "Webhook URL"}
          </label>
          <input
            readOnly
            value={getMonitorEndpointUrl(monitorId, tokenType)}
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
            {isHeartbeat
              ? `{ "token": "...", "message": "..." }`
              : `{ "token": "...", "status": "up|down|degraded", "message": "..." }`}
          </p>
        </div>
      </div>
      <div className="button-row">
        <button type="button" className="button-success" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
