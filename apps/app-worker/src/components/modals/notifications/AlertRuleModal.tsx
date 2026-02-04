import { useState, useEffect, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { toTitleCase } from "@/utils/format";
import {
  createAlertRuleFn,
  updateAlertRuleFn,
} from "@/server/functions/alert-rules";

type Monitor = { id: string; name: string };
type Project = { id: string; name: string };
type Channel = { id: string; type: string; configJson: string };
type AlertRule = {
  id: string;
  name: string;
  sourceType: string;
  projectId: string | null;
  monitorId: string | null;
  environment: string | null;
  triggerType: string;
  conditionsJson: string | null;
  thresholdJson: string | null;
  channelId: string;
  actionIntervalSeconds: number;
};

const TRIGGER_TYPES = [
  { value: "new_issue", label: "New Issue" },
  { value: "issue_regression", label: "Issue Regression" },
  { value: "event_threshold", label: "Event Threshold" },
  { value: "user_threshold", label: "User Threshold" },
  { value: "status_change", label: "Status Change" },
  { value: "high_priority", label: "High Priority" },
  { value: "monitor_down", label: "Monitor Down" },
  { value: "monitor_recovery", label: "Monitor Recovery" },
];

const TIME_WINDOWS = [
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 14400, label: "4 hours" },
  { value: 86400, label: "24 hours" },
];

const ACTION_INTERVALS = [
  { value: 300, label: "5 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 1800, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 14400, label: "4 hours" },
  { value: 86400, label: "24 hours" },
];

interface AlertRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  editingRule: AlertRule | null;
  monitors: Monitor[];
  projects: Project[];
  channels: Channel[];
}

export function AlertRuleModal({
  isOpen,
  onClose,
  onSuccess,
  editingRule,
  monitors,
  projects,
  channels,
}: AlertRuleModalProps) {
  const [ruleName, setRuleName] = useState("");
  const [ruleSourceType, setRuleSourceType] = useState("issue");
  const [ruleProjectId, setRuleProjectId] = useState("");
  const [ruleMonitorId, setRuleMonitorId] = useState("");
  const [ruleEnvironment, setRuleEnvironment] = useState("");
  const [ruleTriggerType, setRuleTriggerType] = useState("new_issue");
  const [ruleChannelId, setRuleChannelId] = useState(channels?.[0]?.id || "");
  const [ruleActionInterval, setRuleActionInterval] = useState("3600");
  const [ruleThresholdType, setRuleThresholdType] = useState("static");
  const [ruleWindowSeconds, setRuleWindowSeconds] = useState("3600");
  const [ruleMetric, setRuleMetric] = useState("count");
  const [ruleCritical, setRuleCritical] = useState("10");
  const [ruleWarning, setRuleWarning] = useState("");
  const [ruleResolved, setRuleResolved] = useState("");
  const [ruleFilterLevel, setRuleFilterLevel] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createRule = useServerFn(createAlertRuleFn);
  const updateRule = useServerFn(updateAlertRuleFn);

  const resetForm = () => {
    setRuleName("");
    setRuleSourceType("issue");
    setRuleProjectId("");
    setRuleMonitorId("");
    setRuleEnvironment("");
    setRuleTriggerType("new_issue");
    setRuleChannelId(channels?.[0]?.id || "");
    setRuleActionInterval("3600");
    setRuleThresholdType("static");
    setRuleWindowSeconds("3600");
    setRuleMetric("count");
    setRuleCritical("10");
    setRuleWarning("");
    setRuleResolved("");
    setRuleFilterLevel([]);
    setError(null);
  };

  useEffect(() => {
    if (editingRule) {
      setRuleName(editingRule.name);
      setRuleSourceType(editingRule.sourceType);
      setRuleProjectId(editingRule.projectId || "");
      setRuleMonitorId(editingRule.monitorId || "");
      setRuleEnvironment(editingRule.environment || "");
      setRuleTriggerType(editingRule.triggerType);
      setRuleChannelId(editingRule.channelId);
      setRuleActionInterval(String(editingRule.actionIntervalSeconds));

      if (editingRule.thresholdJson) {
        const t = JSON.parse(editingRule.thresholdJson);
        setRuleThresholdType(t.type || "static");
        setRuleWindowSeconds(String(t.windowSeconds || 3600));
        setRuleMetric(t.metric || "count");
        setRuleCritical(String(t.critical || 10));
        setRuleWarning(t.warning ? String(t.warning) : "");
        setRuleResolved(t.resolved ? String(t.resolved) : "");
      }

      if (editingRule.conditionsJson) {
        const c = JSON.parse(editingRule.conditionsJson);
        setRuleFilterLevel(c.level || []);
      }
    } else {
      resetForm();
    }
  }, [editingRule, channels]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const onSaveRule = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const needsThreshold =
      ruleTriggerType === "event_threshold" ||
      ruleTriggerType === "user_threshold";

    const threshold = needsThreshold
      ? {
          type: ruleThresholdType,
          windowSeconds: Number(ruleWindowSeconds),
          metric: ruleMetric,
          critical: Number(ruleCritical),
          warning: ruleWarning ? Number(ruleWarning) : undefined,
          resolved: ruleResolved ? Number(ruleResolved) : undefined,
        }
      : null;

    const conditions =
      ruleSourceType === "issue" && ruleFilterLevel.length > 0
        ? { level: ruleFilterLevel }
        : null;

    try {
      if (editingRule) {
        await updateRule({
          data: {
            id: editingRule.id,
            name: ruleName,
            sourceType: ruleSourceType,
            projectId:
              ruleSourceType === "issue" ? ruleProjectId || null : null,
            monitorId:
              ruleSourceType === "monitor" ? ruleMonitorId || null : null,
            environment: ruleEnvironment || null,
            triggerType: ruleTriggerType,
            channelId: ruleChannelId,
            actionIntervalSeconds: Number(ruleActionInterval),
            threshold,
            conditions,
          },
        });
      } else {
        await createRule({
          data: {
            name: ruleName,
            sourceType: ruleSourceType,
            projectId:
              ruleSourceType === "issue" ? ruleProjectId || null : null,
            monitorId:
              ruleSourceType === "monitor" ? ruleMonitorId || null : null,
            environment: ruleEnvironment || null,
            triggerType: ruleTriggerType as
              | "new_issue"
              | "issue_regression"
              | "event_threshold"
              | "user_threshold"
              | "status_change"
              | "high_priority"
              | "monitor_down"
              | "monitor_recovery",
            channelId: ruleChannelId,
            actionIntervalSeconds: Number(ruleActionInterval),
            threshold,
            conditions,
          },
        });
      }
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const getChannelDisplay = (channel: Channel) => {
    const config = JSON.parse(channel.configJson);
    if (channel.type === "email") {
      return { title: config.label || "Email channel", subtitle: config.to };
    }
    return { title: config.label || "Webhook channel", subtitle: config.url };
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={editingRule ? "Edit Alert Rule" : "Create Alert Rule"}
    >
      <form className="form" onSubmit={onSaveRule}>
        {error && <div className="form-error">{error}</div>}
        <label htmlFor="rule-name">Name</label>
        <input
          id="rule-name"
          value={ruleName}
          onChange={(e) => setRuleName(e.target.value)}
          placeholder="High volume errors"
          required
        />

        <label htmlFor="rule-source-type">Source Type</label>
        <select
          id="rule-source-type"
          value={ruleSourceType}
          onChange={(e) => {
            const newSourceType = e.target.value;
            setRuleSourceType(newSourceType);
            if (newSourceType === "monitor") {
              setRuleTriggerType("monitor_down");
              setRuleFilterLevel([]);
            } else {
              setRuleTriggerType("new_issue");
            }
          }}
        >
          <option value="issue">Issue</option>
          <option value="monitor">Monitor</option>
        </select>

        {ruleSourceType === "issue" && (
          <div className="grid two">
            <div>
              <label htmlFor="rule-project">Project (optional)</label>
              <select
                id="rule-project"
                value={ruleProjectId}
                onChange={(e) => setRuleProjectId(e.target.value)}
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rule-environment">Environment (optional)</label>
              <input
                id="rule-environment"
                value={ruleEnvironment}
                onChange={(e) => setRuleEnvironment(e.target.value)}
                placeholder="production"
              />
            </div>
          </div>
        )}

        {ruleSourceType === "monitor" && (
          <div>
            <label htmlFor="rule-monitor">Monitor</label>
            <select
              id="rule-monitor"
              value={ruleMonitorId}
              onChange={(e) => setRuleMonitorId(e.target.value)}
              required
            >
              <option value="">Select a monitor</option>
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <label htmlFor="rule-trigger">Trigger</label>
        <select
          id="rule-trigger"
          value={ruleTriggerType}
          onChange={(e) => setRuleTriggerType(e.target.value)}
        >
          {TRIGGER_TYPES.filter((t) =>
            ruleSourceType === "monitor"
              ? ["monitor_down", "monitor_recovery"].includes(t.value)
              : !["monitor_down", "monitor_recovery"].includes(t.value)
          ).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {(ruleTriggerType === "event_threshold" ||
          ruleTriggerType === "user_threshold") && (
          <fieldset className="fieldset">
            <legend>Threshold Configuration</legend>
            <div className="grid two">
              <div>
                <label htmlFor="rule-threshold-type">Type</label>
                <select
                  id="rule-threshold-type"
                  value={ruleThresholdType}
                  onChange={(e) => setRuleThresholdType(e.target.value)}
                >
                  <option value="static">Static</option>
                  <option value="percent_change">Percent change</option>
                </select>
              </div>
              <div>
                <label htmlFor="rule-window">Time window</label>
                <select
                  id="rule-window"
                  value={ruleWindowSeconds}
                  onChange={(e) => setRuleWindowSeconds(e.target.value)}
                >
                  {TIME_WINDOWS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label htmlFor="rule-metric">Metric</label>
            <select
              id="rule-metric"
              value={ruleMetric}
              onChange={(e) => setRuleMetric(e.target.value)}
            >
              <option value="count">Event count</option>
              <option value="count_unique_users">Unique users</option>
            </select>
            <div className="grid three">
              <div>
                <label htmlFor="rule-critical">Critical threshold</label>
                <input
                  id="rule-critical"
                  type="number"
                  min="1"
                  value={ruleCritical}
                  onChange={(e) => setRuleCritical(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="rule-warning">Warning (optional)</label>
                <input
                  id="rule-warning"
                  type="number"
                  min="1"
                  value={ruleWarning}
                  onChange={(e) => setRuleWarning(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="rule-resolved">Resolved (optional)</label>
                <input
                  id="rule-resolved"
                  type="number"
                  min="0"
                  value={ruleResolved}
                  onChange={(e) => setRuleResolved(e.target.value)}
                />
              </div>
            </div>
          </fieldset>
        )}

        {ruleSourceType === "issue" && (
          <fieldset className="fieldset">
            <legend>Filters (optional)</legend>
            <label>Error levels</label>
            <div className="checkbox-group">
              {["error", "warning", "info", "debug"].map((level) => (
                <label key={level} className="checkbox">
                  <input
                    type="checkbox"
                    checked={ruleFilterLevel.includes(level)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setRuleFilterLevel([...ruleFilterLevel, level]);
                      } else {
                        setRuleFilterLevel(
                          ruleFilterLevel.filter((l) => l !== level)
                        );
                      }
                    }}
                  />
                  {toTitleCase(level)}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label htmlFor="rule-channel">Notification Channel</label>
        <select
          id="rule-channel"
          value={ruleChannelId}
          onChange={(e) => setRuleChannelId(e.target.value)}
          required
        >
          <option value="">Select channel</option>
          {channels.map((ch) => {
            const display = getChannelDisplay(ch);
            return (
              <option key={ch.id} value={ch.id}>
                [{ch.type}] {display.title}
              </option>
            );
          })}
        </select>

        <label htmlFor="rule-interval">Rate limit</label>
        <select
          id="rule-interval"
          value={ruleActionInterval}
          onChange={(e) => setRuleActionInterval(e.target.value)}
        >
          {ACTION_INTERVALS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>

        <FormActions>
          <button type="submit">
            {editingRule ? "Save Changes" : "Create Rule"}
          </button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
