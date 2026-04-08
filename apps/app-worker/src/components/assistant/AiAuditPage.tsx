import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { ErrorCard } from "@/components/feedback";
import { Card, CardTitle, Page, PageHeader } from "@/components/layout";
import { ListContainer, ListRow } from "@/components/list";
import { Badge, Button } from "@/components/ui";
import {
  runTypeLabel,
  type AiAssistantRun,
  isAuditRun,
  type AiActionItem,
  type AiActionRunSummary,
} from "@/lib/ai-assistant-chat";
import { getAiAssistantSettingsFn } from "@/server/functions/ai-assistant";

import { AssistantMarkdown } from "./AssistantMarkdown";
import { useAssistantActionRuns } from "./hooks/useAssistantActionRuns";
import { useAssistantStreaming } from "./hooks/useAssistantStreaming";

type AiAuditPageProps = {
  initialSettings: {
    enabled: boolean;
    model: string;
    lastAutoAuditAt: number | null;
  };
  initialRuns: AiAssistantRun[];
  initialActionRuns: unknown;
};

function runStatusVariant(
  status: AiActionRunSummary["status"]
): "default" | "success" | "warning" | "danger" | "muted" | "info" {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "awaiting_approval" || status === "blocked") return "warning";
  if (status === "executing") return "info";
  if (status === "planning") return "muted";
  return "default";
}

function actionStatusVariant(
  status: AiActionItem["status"]
): "default" | "success" | "warning" | "danger" | "muted" | "info" {
  if (status === "completed" || status === "rolled_back") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "pending" || status === "blocked") return "warning";
  if (status === "executing") return "info";
  if (status === "approved") return "muted";
  return "default";
}

function riskTierVariant(
  riskTier: AiActionItem["riskTier"]
): "default" | "success" | "warning" | "danger" | "muted" | "info" {
  if (riskTier === "critical" || riskTier === "high") return "danger";
  if (riskTier === "medium") return "warning";
  if (riskTier === "low") return "success";
  return "muted";
}

export function AiAuditPage({
  initialSettings,
  initialRuns,
  initialActionRuns,
}: AiAuditPageProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasHydratedActionRuns = useRef(false);
  const [isEnabled, setIsEnabled] = useState<boolean>(initialSettings.enabled);
  const [model, setModel] = useState<string>(initialSettings.model);
  const [lastAuditAt, setLastAuditAt] = useState<number | null>(
    initialSettings.lastAutoAuditAt
  );
  const [runs, setRuns] = useState<AiAssistantRun[]>(initialRuns);
  const [activeAuditRunId, setActiveAuditRunId] = useState<string | null>(null);
  const [expandedActionRunId, setExpandedActionRunId] = useState<string | null>(
    null
  );

  const getAiSettings = useServerFn(getAiAssistantSettingsFn);
  const {
    actionRuns,
    activeActionRunId,
    activeActionRunActions,
    isActionLoading,
    refreshActionRuns,
    loadActionRun,
    runActionOperation,
    syncActionRuns,
  } = useAssistantActionRuns();

  const applySettingsSnapshot = (settings: {
    enabled: boolean;
    model: string;
    lastAutoAuditAt: number | null;
  }) => {
    setIsEnabled(settings.enabled);
    setModel(settings.model);
    setLastAuditAt(settings.lastAutoAuditAt);
  };

  const refreshMetadata = async (options?: { includeActionRuns?: boolean }) => {
    const refreshed = await getAiSettings();
    applySettingsSnapshot(refreshed.settings);
    setRuns(refreshed.latestRuns);
    if (options?.includeActionRuns !== false) {
      await refreshActionRuns();
    }
  };

  const {
    auditFocus,
    setAuditFocus,
    isRunningAudit,
    isLoading,
    auditPreviewThinking,
    auditPreviewAnswer,
    runAudit,
    cancelAuditStream,
  } = useAssistantStreaming({
    isEnabled,
    refreshMetadata,
    onClearError: () => setError(null),
    onError: (message) => setError(message),
  });

  useEffect(() => {
    if (hasHydratedActionRuns.current) return;
    hasHydratedActionRuns.current = true;
    void (async () => {
      setError(null);
      try {
        await syncActionRuns(initialActionRuns);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [initialActionRuns, syncActionRuns]);

  const auditRuns = useMemo(() => runs.filter(isAuditRun), [runs]);
  const auditHistoryRuns = useMemo(() => auditRuns.slice(0, 12), [auditRuns]);

  useEffect(() => {
    if (!auditRuns.length) {
      setActiveAuditRunId(null);
      return;
    }
  }, [activeAuditRunId, auditRuns]);

  const onSelectActionRun = async (runId: string) => {
    setError(null);
    try {
      await loadActionRun(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onRunActionOperation = async (
    actionId: string,
    operation: "approve" | "reject" | "retry" | "rollback"
  ) => {
    setError(null);
    try {
      await runActionOperation(actionId, operation);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onRefresh = async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      await refreshMetadata();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRefreshing(false);
    }
  };

  const onToggleActionRun = (runId: string) => {
    if (expandedActionRunId === runId) {
      setExpandedActionRunId(null);
      return;
    }

    setExpandedActionRunId(runId);
    if (activeActionRunId !== runId) {
      void onSelectActionRun(runId);
    }
  };

  return (
    <Page className="page-stack">
      <PageHeader
        title="AI Audit"
        description="Run AI audits and manage generated action runs."
      >
        <div className="button-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => void onRefresh()}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </PageHeader>

      {error ? <ErrorCard message={error} /> : null}

      <Card>
        <CardTitle>Overview</CardTitle>
        <ListContainer>
          <ListRow
            title="Assistant"
            subtitle={isEnabled ? "Enabled for this team" : "Disabled in settings"}
            badges={
              <Badge size="small" variant={isEnabled ? "success" : "warning"}>
                {isEnabled ? "Enabled" : "Disabled"}
              </Badge>
            }
          />
          <ListRow title="Model" subtitle={model} isOdd />
          <ListRow
            title="Last auto audit"
            subtitle={
              lastAuditAt ? new Date(lastAuditAt * 1000).toLocaleString() : "Never"
            }
            isOdd
          />
        </ListContainer>
      </Card>

      <Card>
        <CardTitle>Run Manual Audit</CardTitle>
        <div className="form">
          <div className="form-field">
            <label htmlFor="ai-audit-focus">Optional focus</label>
            <input
              id="ai-audit-focus"
              value={auditFocus}
              onChange={(event) => setAuditFocus(event.target.value)}
              placeholder="e.g. noisy monitor transitions and approval queues"
              disabled={isRunningAudit}
            />
          </div>
          <div className="button-row">
            {isRunningAudit ? (
              <Button type="button" variant="outline" onClick={cancelAuditStream}>
                Cancel
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => void runAudit()}
              disabled={isRunningAudit || isLoading || !isEnabled}
            >
              {isRunningAudit ? "Running..." : "Run Audit"}
            </Button>
          </div>
        </div>
        {(isRunningAudit || auditPreviewThinking || auditPreviewAnswer) && (
          <div className="ai-audit-output">
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
              content={auditPreviewAnswer || (isRunningAudit ? "Generating audit..." : "")}
            />
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Audit History</CardTitle>
        {auditHistoryRuns.length === 0 ? (
          <div className="muted">No manual or scheduled audits yet.</div>
        ) : (
          <ListContainer>
            {auditHistoryRuns.map((run, index) => {
              const isOutputExpanded = activeAuditRunId === run.id;

              return (
                <ListRow
                  key={run.id}
                  className="list-item-expanded"
                  title={`${runTypeLabel(run.runType)} · ${new Date(run.createdAt).toLocaleString()}`}
                  subtitle={run.question || "No focus provided"}
                  isOdd={index > 0}
                  actions={
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        isOutputExpanded
                          ? setActiveAuditRunId(null)
                          : setActiveAuditRunId(run.id)
                      }
                    >
                      {isOutputExpanded ? "Hide output" : "View output"}
                    </Button>
                  }
                  expanded={isOutputExpanded}
                  expandedContent={
                    <div className="ai-audit-output ai-audit-expanded-panel">
                      <div className="assistant-section-title">
                        {runTypeLabel(run.runType)} output
                      </div>
                      <AssistantMarkdown content={run.answer} />
                    </div>
                  }
                />
              );
            })}
          </ListContainer>
        )}
      </Card>

      <Card>
        <CardTitle
          actions={
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void refreshActionRuns()}
            >
              Refresh action runs
            </Button>
          }
        >
          Action Runs
        </CardTitle>
        {actionRuns.length === 0 ? (
          <div className="muted">
            No action runs yet. Runs are created from audits, monitor transitions,
            and Sentry events.
          </div>
        ) : (
          <ListContainer>
            {actionRuns.map((run, index) => {
              const isExpanded = expandedActionRunId === run.id;
              const isLoaded = activeActionRunId === run.id;

              return (
                <ListRow
                  key={run.id}
                  className="list-item-expanded"
                  isOdd={index > 0}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{run.triggerSource}:{run.triggerType}</span>
                      <Badge size="small" variant={runStatusVariant(run.status)}>
                        {run.status}
                      </Badge>
                    </span>
                  }
                  subtitle={new Date(run.createdAt).toLocaleString()}
                  actions={
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => onToggleActionRun(run.id)}
                    >
                      {isExpanded ? "Hide actions" : "View actions"}
                    </Button>
                  }
                  expanded={isExpanded}
                  expandedContent={
                    <div className="ai-audit-action-details ai-audit-expanded-panel">
                      <div className="assistant-section-title">Actions in this run</div>
                      {(!isLoaded || isActionLoading) && isExpanded ? (
                        <div className="muted">Loading actions...</div>
                      ) : activeActionRunActions.length === 0 ? (
                        <div className="muted">No actions found for this run.</div>
                      ) : (
                        <ListContainer>
                          {activeActionRunActions.map((action, actionIndex) => (
                            <ListRow
                              key={action.id}
                              isOdd={actionIndex > 0}
                              title={
                                <span className="flex flex-wrap items-center gap-2">
                                  <span>{action.title}</span>
                                  <Badge
                                    size="small"
                                    variant={riskTierVariant(action.riskTier)}
                                  >
                                    {action.riskTier}
                                  </Badge>
                                  <Badge
                                    size="small"
                                    variant={actionStatusVariant(action.status)}
                                  >
                                    {action.status}
                                  </Badge>
                                </span>
                              }
                              subtitle={action.actionType}
                              actions={
                                <div className="button-row">
                                  {action.requiresApproval && action.status === "pending" ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() =>
                                          void onRunActionOperation(action.id, "approve")
                                        }
                                      >
                                        Approve
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        color="danger"
                                        onClick={() =>
                                          void onRunActionOperation(action.id, "reject")
                                        }
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
                                      onClick={() =>
                                        void onRunActionOperation(action.id, "retry")
                                      }
                                    >
                                      Retry
                                    </Button>
                                  ) : null}
                                  {action.status === "completed" ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="xs"
                                      onClick={() =>
                                        void onRunActionOperation(action.id, "rollback")
                                      }
                                    >
                                      Rollback
                                    </Button>
                                  ) : null}
                                </div>
                              }
                            />
                          ))}
                        </ListContainer>
                      )}
                    </div>
                  }
                />
              );
            })}
          </ListContainer>
        )}
      </Card>
    </Page>
  );
}
