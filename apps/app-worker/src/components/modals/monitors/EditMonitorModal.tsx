import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { updateMonitorFn } from "@/server/functions/monitors";
import { validateJsonConfig, type MonitorType } from "./monitorConfig";
import { MonitorForm, type MonitorFormValues } from "./MonitorForm";

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

export function EditMonitorModal({
  isOpen,
  onClose,
  onSuccess,
  monitor,
  groups,
}: EditMonitorModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] =
    useState<MonitorFormValues>(DEFAULT_FORM_VALUES);

  const updateMonitor = useServerFn(updateMonitorFn);

  useEffect(() => {
    if (!isOpen || !monitor) return;

    setError(null);

    let externalServiceType = "";
    let checkConfig = "";
    let checkConfigError: string | null = null;

    if (monitor.externalConfig) {
      if (monitor.type === "external") {
        try {
          const config = JSON.parse(monitor.externalConfig);
          externalServiceType = config.serviceType || "";
        } catch {
          externalServiceType = "";
        }
      } else {
        checkConfig = monitor.externalConfig;
        checkConfigError = validateJsonConfig(monitor.externalConfig);
      }
    }

    setFormValues({
      name: monitor.name,
      url: monitor.url || "",
      groupId: monitor.groupId || null,
      interval: String(monitor.intervalSeconds),
      timeout: String(monitor.timeoutMs),
      threshold: String(monitor.failureThreshold),
      monitorType: monitor.type as MonitorType,
      externalServiceType,
      checkConfig,
      checkConfigError,
    });
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
      await updateMonitor({
        data: {
          id: monitor.id,
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
        <MonitorForm
          values={formValues}
          onChange={setFormValues}
          groups={groups}
          showTypeSelector={false}
          idPrefix="edit"
        />

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
