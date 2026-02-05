import {
  configHelp,
  validateJsonConfig,
  MONITOR_TYPE_CONFIG,
  type MonitorType,
} from "./monitorConfig";

interface MonitorFormValues {
  name: string;
  url: string;
  groupId: string | null;
  interval: string;
  timeout: string;
  threshold: string;
  monitorType: MonitorType;
  externalServiceType: string;
  checkConfig: string;
  checkConfigError: string | null;
}

interface MonitorFormProps {
  values: MonitorFormValues;
  onChange: (values: MonitorFormValues) => void;
  groups: Array<{ id: string; name: string }>;
  showTypeSelector?: boolean;
  idPrefix?: string;
}

export function MonitorForm({
  values,
  onChange,
  groups,
  showTypeSelector = true,
  idPrefix = "monitor",
}: MonitorFormProps) {
  const config = MONITOR_TYPE_CONFIG[values.monitorType];

  const updateField = <K extends keyof MonitorFormValues>(
    field: K,
    value: MonitorFormValues[K]
  ) => {
    onChange({ ...values, [field]: value });
  };

  const showConfigEditor =
    values.monitorType !== "http" &&
    values.monitorType !== "webhook" &&
    values.monitorType !== "external" &&
    values.monitorType !== "manual";

  const showIntervalFields =
    values.monitorType !== "webhook" && values.monitorType !== "manual";

  return (
    <>
      {showTypeSelector && (
        <>
          <label htmlFor={`${idPrefix}-type`}>Type</label>
          <select
            id={`${idPrefix}-type`}
            value={values.monitorType}
            onChange={(e) => {
              updateField("monitorType", e.target.value as MonitorType);
              updateField(
                "checkConfigError",
                validateJsonConfig(values.checkConfig)
              );
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
        </>
      )}

      <label htmlFor={`${idPrefix}-name`}>Name</label>
      <input
        id={`${idPrefix}-name`}
        value={values.name}
        onChange={(e) => updateField("name", e.target.value)}
        placeholder="API gateway"
        required
      />

      <label htmlFor={`${idPrefix}-group`}>Monitor group</label>
      <select
        id={`${idPrefix}-group`}
        value={values.groupId || ""}
        onChange={(e) => updateField("groupId", e.target.value || null)}
      >
        <option value="">No group</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {config.requiresUrl ? (
        <>
          <label htmlFor={`${idPrefix}-url`}>{config.urlLabel}</label>
          <input
            id={`${idPrefix}-url`}
            value={values.url}
            onChange={(e) => updateField("url", e.target.value)}
            placeholder={config.urlPlaceholder}
            required
          />
        </>
      ) : config.description ? (
        <p className="muted">{config.description}</p>
      ) : null}

      {config.hasExternalServiceField && (
        <>
          <label htmlFor={`${idPrefix}-external-service`}>Service Type</label>
          <select
            id={`${idPrefix}-external-service`}
            value={values.externalServiceType}
            onChange={(e) => updateField("externalServiceType", e.target.value)}
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

      {showConfigEditor && (
        <>
          <label htmlFor={`${idPrefix}-config`}>Config (JSON)</label>
          <p className="muted -mt-1">Optional. Leave blank to use defaults.</p>
          <textarea
            id={`${idPrefix}-config`}
            value={values.checkConfig}
            onChange={(e) => {
              const value = e.target.value;
              updateField("checkConfig", value);
              updateField("checkConfigError", validateJsonConfig(value));
            }}
            rows={4}
          />
          {values.checkConfigError && (
            <p className="text-red-600">{values.checkConfigError}</p>
          )}
          <ConfigHelp monitorType={values.monitorType} />
        </>
      )}

      {showIntervalFields && (
        <div className="grid three">
          <div>
            <label htmlFor={`${idPrefix}-interval`}>Interval (sec)</label>
            <input
              id={`${idPrefix}-interval`}
              type="number"
              min="30"
              max="3600"
              value={values.interval}
              onChange={(e) => updateField("interval", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-timeout`}>Timeout (ms)</label>
            <input
              id={`${idPrefix}-timeout`}
              type="number"
              min="1000"
              max="30000"
              value={values.timeout}
              onChange={(e) => updateField("timeout", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-threshold`}>Failure threshold</label>
            <input
              id={`${idPrefix}-threshold`}
              type="number"
              min="1"
              max="10"
              value={values.threshold}
              onChange={(e) => updateField("threshold", e.target.value)}
            />
          </div>
        </div>
      )}
    </>
  );
}

function ConfigHelp({ monitorType }: { monitorType: string }) {
  const help = configHelp(monitorType);
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
}

export type { MonitorFormValues };
