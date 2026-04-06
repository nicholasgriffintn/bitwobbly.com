import { Button } from "@/components/ui";
import { runTypeLabel, type AiAssistantRun } from "@/lib/ai-assistant-chat";

type AssistantOpsTabProps = {
  isEnabled: boolean | null;
  model: string | null;
  lastAuditAt: number | null;
  auditFocus: string;
  isRunningAudit: boolean;
  isLoading: boolean;
  runs: AiAssistantRun[];
  latestAudit: AiAssistantRun | null;
  onAuditFocusChange: (value: string) => void;
  onRunAudit: () => Promise<void>;
};

export function AssistantOpsTab({
  isEnabled,
  model,
  lastAuditAt,
  auditFocus,
  isRunningAudit,
  isLoading,
  runs,
  latestAudit,
  onAuditFocusChange,
  onRunAudit,
}: AssistantOpsTabProps) {
  return (
    <div className="assistant-content assistant-ops">
      {isEnabled !== true ? (
        <div className="assistant-empty-state">
          Enable assistant access in settings to run audits and assistant
          checks.
        </div>
      ) : (
        <>
          <div className="assistant-meta-grid">
            <div className="assistant-meta-item">
              <div className="assistant-meta-label">Model</div>
              <div className="assistant-meta-value">{model ?? "Not set"}</div>
            </div>
            <div className="assistant-meta-item">
              <div className="assistant-meta-label">Last audit run</div>
              <div className="assistant-meta-value">
                {lastAuditAt
                  ? new Date(lastAuditAt * 1000).toLocaleString()
                  : "Never"}
              </div>
            </div>
          </div>

          <div className="assistant-ops-section">
            <label className="assistant-label" htmlFor="assistant-audit-focus">
              Run audit now (optional focus)
            </label>
            <input
              id="assistant-audit-focus"
              className="assistant-input"
              value={auditFocus}
              onChange={(event) => onAuditFocusChange(event.target.value)}
              placeholder="e.g. notification noise for Sentry issue spikes"
            />
            <div className="assistant-composer-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => void onRunAudit()}
                disabled={isRunningAudit || isLoading}
              >
                {isRunningAudit ? "Running…" : "Run Audit"}
              </Button>
            </div>
          </div>

          <div className="assistant-ops-section">
            <div className="assistant-section-title">Recent AI runs</div>
            {runs.length === 0 ? (
              <div className="muted">No runs yet.</div>
            ) : (
              <ul className="assistant-run-list">
                {runs.slice(0, 6).map((run) => (
                  <li key={run.id} className="assistant-run-item">
                    <div className="assistant-run-title">
                      {runTypeLabel(run.runType)}
                    </div>
                    <div className="assistant-run-meta">
                      {new Date(run.createdAt).toLocaleString()} · {run.model}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {latestAudit && (
            <details className="assistant-ops-section">
              <summary className="assistant-section-title">
                Latest audit output
              </summary>
              <pre className="assistant-pre">{latestAudit.answer}</pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}
