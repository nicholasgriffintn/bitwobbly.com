import { useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardTitle } from "@/components/layout";
import { Button } from "@/components/ui";
import { updateAiAssistantSettingsFn } from "@/server/functions/ai-assistant";

type AiSettings = {
  teamId: string;
  enabled: boolean;
  model: string;
  autoAuditEnabled: boolean;
  autoAuditIntervalMinutes: number;
  maxContextItems: number;
  includeIssues: boolean;
  includeMonitors: boolean;
  includeComponents: boolean;
  includeStatusPages: boolean;
  includeNotifications: boolean;
  includeGroupingRules: boolean;
  customInstructions: string | null;
  lastAutoAuditAt: number | null;
};

type Props = {
  initialSettings: AiSettings;
};

export function AiAssistantSettingsCard({ initialSettings }: Props) {
  const [settings, setSettings] = useState<AiSettings>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const updateSettings = useServerFn(updateAiAssistantSettingsFn);

  const onCheckbox =
    (key: keyof AiSettings) => (event: ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setSettings((previous) => ({ ...previous, [key]: checked }));
    };

  const onSave = async () => {
    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const response = await updateSettings({
        data: {
          enabled: settings.enabled,
          model: settings.model.trim(),
          autoAuditEnabled: settings.autoAuditEnabled,
          autoAuditIntervalMinutes: settings.autoAuditIntervalMinutes,
          maxContextItems: settings.maxContextItems,
          includeIssues: settings.includeIssues,
          includeMonitors: settings.includeMonitors,
          includeComponents: settings.includeComponents,
          includeStatusPages: settings.includeStatusPages,
          includeNotifications: settings.includeNotifications,
          includeGroupingRules: settings.includeGroupingRules,
          customInstructions: settings.customInstructions?.trim()
            ? settings.customInstructions.trim()
            : null,
        },
      });
      setSettings(response.settings);
      setMessage("AI settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardTitle>AI Assistant</CardTitle>
      <p className="muted mt-0">
        Configure Workers AI assistance for operations guidance and monitoring
        recommendations.
      </p>

      {error && <div className="form-error mb-3">{error}</div>}
      {message && <div className="muted mb-3">{message}</div>}

      <div className="form">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={onCheckbox("enabled")}
          />
          Enable assistant
        </label>

        {settings.enabled && (
          <>
            <label htmlFor="ai-model">Model</label>
            <input
              id="ai-model"
              value={settings.model}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  model: event.target.value,
                }))
              }
              placeholder="@cf/moonshotai/kimi-k2.5"
            />

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.autoAuditEnabled}
                onChange={onCheckbox("autoAuditEnabled")}
              />
              Enable scheduled auto-audits
            </label>

            <label htmlFor="ai-audit-interval">Auto-audit interval (minutes)</label>
            <input
              id="ai-audit-interval"
              type="number"
              min={15}
              max={10080}
              value={settings.autoAuditIntervalMinutes}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  autoAuditIntervalMinutes: Number(event.target.value),
                }))
              }
            />

            <label htmlFor="ai-context-limit">Max context items per section</label>
            <input
              id="ai-context-limit"
              type="number"
              min={5}
              max={100}
              value={settings.maxContextItems}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  maxContextItems: Number(event.target.value),
                }))
              }
            />

            <label htmlFor="ai-instructions">Custom instructions</label>
            <textarea
              id="ai-instructions"
              value={settings.customInstructions ?? ""}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  customInstructions: event.target.value,
                }))
              }
              rows={5}
              placeholder="Example: prioritise low-noise alerting recommendations."
            />

            <div className="grid two">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.includeMonitors}
                  onChange={onCheckbox("includeMonitors")}
                />
                Include monitors
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.includeComponents}
                  onChange={onCheckbox("includeComponents")}
                />
                Include components
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.includeIssues}
                  onChange={onCheckbox("includeIssues")}
                />
                Include incidents and issues
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.includeStatusPages}
                  onChange={onCheckbox("includeStatusPages")}
                />
                Include status pages
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.includeNotifications}
                  onChange={onCheckbox("includeNotifications")}
                />
                Include notification config
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.includeGroupingRules}
                  onChange={onCheckbox("includeGroupingRules")}
                />
                Include issue grouping rules
              </label>
            </div>
          </>
        )}

        <div className="button-row">
          <Button
            type="button"
            variant="outline"
            color="success"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save AI Settings"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
