import { Button } from "@/components/ui";
import { runTypeLabel, type AiAssistantRun } from "@/lib/ai-assistant-chat";
import { AssistantMarkdown } from "./AssistantMarkdown";

type AssistantOpsTabProps = {
  isEnabled: boolean | null;
  model: string | null;
  lastAuditAt: number | null;
  auditFocus: string;
  isRunningAudit: boolean;
  isLoading: boolean;
  auditRuns: AiAssistantRun[];
  auditPreviewThinking: string;
  auditPreviewAnswer: string;
  onAuditFocusChange: (value: string) => void;
  onRunAudit: () => Promise<void>;
  onCancelAudit: () => void;
};

export function AssistantOpsTab({
  isEnabled,
  model,
  lastAuditAt,
  auditFocus,
  isRunningAudit,
  isLoading,
  auditRuns,
  auditPreviewThinking,
  auditPreviewAnswer,
  onAuditFocusChange,
  onRunAudit,
  onCancelAudit,
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

          {(isRunningAudit || auditPreviewThinking || auditPreviewAnswer) && (
            <div className="assistant-ops-section">
              <div className="assistant-section-title">
                Manual audit output {isRunningAudit ? "(streaming)" : ""}
              </div>
              {auditPreviewThinking ? (
                <div className="assistant-thinking">
                  <div className="assistant-thinking-label">Thinking</div>
                  <div>{auditPreviewThinking}</div>
                </div>
              ) : null}
              <AssistantMarkdown
                content={auditPreviewAnswer || (isRunningAudit ? "Generating audit…" : "")}
              />
            </div>
          )}

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
              disabled={isRunningAudit}
            />
            <div className="assistant-composer-actions">
              {isRunningAudit ? (
                <Button type="button" variant="outline" onClick={onCancelAudit}>
                  Cancel
                </Button>
              ) : null}
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
            <div className="assistant-section-title">Audit history</div>
            {auditRuns.length === 0 ? (
              <div className="muted">No manual or scheduled audits yet.</div>
            ) : (
              <div className="assistant-audit-history">
                {auditRuns.map((run, index) => (
                  <details
                    key={run.id}
                    className="assistant-ops-section"
                    open={index === 0}
                  >
                    <summary className="assistant-section-title">
                      {runTypeLabel(run.runType)} ·{" "}
                      {new Date(run.createdAt).toLocaleString()}
                    </summary>
                    {run.question ? (
                      <div className="assistant-run-meta">{run.question}</div>
                    ) : null}
                    <AssistantMarkdown content={run.answer} />
                  </details>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
