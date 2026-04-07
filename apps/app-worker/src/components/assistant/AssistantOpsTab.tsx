import { Button } from "@/components/ui";
import {
  runTypeLabel,
  type AiActionItem,
  type AiActionRunSummary,
  type AiAssistantRun,
} from "@/lib/ai-assistant-chat";
import { AssistantMarkdown } from "./AssistantMarkdown";

type AssistantOpsTabProps = {
  isEnabled: boolean | null;
  model: string | null;
  lastAuditAt: number | null;
  auditFocus: string;
  isRunningAudit: boolean;
  isLoading: boolean;
  auditRuns: AiAssistantRun[];
  actionRuns: AiActionRunSummary[];
  activeRunId: string | null;
  activeRunActions: AiActionItem[];
  isActionLoading: boolean;
  auditPreviewThinking: string;
  auditPreviewAnswer: string;
  onAuditFocusChange: (value: string) => void;
  onRunAudit: () => Promise<void>;
  onCancelAudit: () => void;
  onSelectRun: (runId: string) => Promise<void>;
  onActionApprove: (actionId: string) => Promise<void>;
  onActionReject: (actionId: string) => Promise<void>;
  onActionRetry: (actionId: string) => Promise<void>;
  onActionRollback: (actionId: string) => Promise<void>;
};

export function AssistantOpsTab({
  isEnabled,
  model,
  lastAuditAt,
  auditFocus,
  isRunningAudit,
  isLoading,
  auditRuns,
  actionRuns,
  activeRunId,
  activeRunActions,
  isActionLoading,
  auditPreviewThinking,
  auditPreviewAnswer,
  onAuditFocusChange,
  onRunAudit,
  onCancelAudit,
  onSelectRun,
  onActionApprove,
  onActionReject,
  onActionRetry,
  onActionRollback,
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

          <div className="assistant-ops-section">
            <div className="assistant-section-title">Action runs</div>
            {actionRuns.length === 0 ? (
              <div className="muted">
                No action runs yet. Runs are created from audits, monitor
                transitions, and Sentry events.
              </div>
            ) : (
              <div className="assistant-audit-history">
                {actionRuns.map((run) => (
                  <details
                    key={run.id}
                    className="assistant-ops-section"
                    open={run.id === activeRunId}
                    onToggle={(event) => {
                      const element = event.currentTarget;
                      if (!element.open) return;
                      void onSelectRun(run.id);
                    }}
                  >
                    <summary className="assistant-section-title">
                      {run.triggerSource}:{run.triggerType} · {run.status} ·{" "}
                      {new Date(run.createdAt).toLocaleString()}
                    </summary>
                    {run.id === activeRunId ? (
                      isActionLoading ? (
                        <div className="muted">Loading actions…</div>
                      ) : activeRunActions.length ? (
                        <div className="assistant-audit-history">
                          {activeRunActions.map((action) => (
                            <div key={action.id} className="assistant-run-meta">
                              <div>
                                <strong>{action.title}</strong> ·{" "}
                                {action.actionType} · {action.riskTier} ·{" "}
                                {action.status}
                              </div>
                              <div className="button-row mt-2">
                                {action.requiresApproval &&
                                action.status === "pending" ? (
                                  <>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="xs"
                                      onClick={() => void onActionApprove(action.id)}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="xs"
                                      color="danger"
                                      onClick={() => void onActionReject(action.id)}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                ) : null}
                                {action.status === "failed" ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={() => void onActionRetry(action.id)}
                                  >
                                    Retry
                                  </Button>
                                ) : null}
                                {action.status === "completed" ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={() => void onActionRollback(action.id)}
                                  >
                                    Rollback
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="muted">No actions found for this run.</div>
                      )
                    ) : null}
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
