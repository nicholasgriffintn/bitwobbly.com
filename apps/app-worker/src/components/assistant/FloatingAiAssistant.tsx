import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { TabNav } from "@/components/navigation";
import { Button } from "@/components/ui";
import {
  type AiAssistantRun,
  isAuditRun,
  isManualQueryRun,
  type AssistantTab,
} from "@/lib/ai-assistant-chat";
import { getAiAssistantSettingsFn } from "@/server/functions/ai-assistant";

import { AssistantChatTab } from "./AssistantChatTab";
import { AssistantOpsTab } from "./AssistantOpsTab";
import { useAssistantActionRuns } from "./hooks/useAssistantActionRuns";
import { useAssistantStreaming } from "./hooks/useAssistantStreaming";

export function FloatingAiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AssistantTab>("chat");
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [lastAuditAt, setLastAuditAt] = useState<number | null>(null);
  const [runs, setRuns] = useState<AiAssistantRun[]>([]);

  const getAiSettings = useServerFn(getAiAssistantSettingsFn);
  const {
    actionRuns,
    activeActionRunId,
    activeActionRunActions,
    isActionLoading,
    refreshActionRuns,
    loadActionRun,
    runActionOperation,
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

  const refreshMetadata = async () => {
    const refreshed = await getAiSettings();
    applySettingsSnapshot(refreshed.settings);
    setRuns(refreshed.latestRuns);
    await refreshActionRuns();
  };

  const {
    question,
    setQuestion,
    messages,
    isLoading,
    auditFocus,
    setAuditFocus,
    isRunningAudit,
    auditPreviewThinking,
    auditPreviewAnswer,
    activeAssistantMessageId,
    sendQuestion,
    runAudit,
    cancelChatStream,
    cancelAuditStream,
    openPastChat,
  } = useAssistantStreaming({
    isEnabled,
    refreshMetadata,
    onClearError: () => setError(null),
    onError: (message) => setError(message),
  });

  useEffect(() => {
    if (!isOpen || isEnabled !== null) return;
    let isMounted = true;

    const loadSettings = async () => {
      setIsInitializing(true);
      setError(null);
      try {
        const response = await getAiSettings();
        if (!isMounted) return;
        applySettingsSnapshot(response.settings);
        setRuns(response.latestRuns);
        await refreshActionRuns();
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    };

    void loadSettings();
    return () => {
      isMounted = false;
    };
  }, [getAiSettings, isEnabled, isOpen, refreshActionRuns]);

  const canSend = useMemo(
    () => !!question.trim() && !isLoading && isEnabled === true,
    [isEnabled, isLoading, question]
  );
  const auditRuns = useMemo(() => runs.filter(isAuditRun), [runs]);
  const manualQueryRuns = useMemo(() => runs.filter(isManualQueryRun), [runs]);
  const showSuggestedPrompts =
    isEnabled === true &&
    !isLoading &&
    question.trim().length === 0 &&
    messages.length === 0;

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

  return (
    <div className="assistant-fab-wrapper">
      {isOpen ? (
        <div className="assistant-panel">
          <div className="assistant-panel-header">
            <div>
              <div className="assistant-panel-title">AI Operations Assistant</div>
              <div className="assistant-panel-subtitle">
                Guidance for monitors, incidents, routing, and setup.
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant"
            >
              Close
            </Button>
          </div>

          <div className="assistant-panel-body">
            <div className="assistant-panel-tabs">
              <TabNav
                tabs={[
                  { id: "chat", label: "Chat" },
                  { id: "ops", label: "Ops", count: auditRuns.length },
                ]}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                className="assistant-tab-nav"
              />
            </div>

            {error && <div className="assistant-panel-error form-error">{error}</div>}

            {activeTab === "chat" ? (
              <AssistantChatTab
                isInitializing={isInitializing}
                isEnabled={isEnabled}
                isLoading={isLoading}
                canSend={canSend}
                question={question}
                messages={messages}
                recentManualChats={manualQueryRuns}
                showSuggestedPrompts={showSuggestedPrompts}
                activeAssistantMessageId={activeAssistantMessageId}
                onQuestionChange={setQuestion}
                onOpenPastChat={openPastChat}
                onSend={sendQuestion}
                onCancel={cancelChatStream}
              />
            ) : (
              <AssistantOpsTab
                isEnabled={isEnabled}
                model={model}
                lastAuditAt={lastAuditAt}
                auditFocus={auditFocus}
                isRunningAudit={isRunningAudit}
                isLoading={isLoading}
                auditRuns={auditRuns}
                actionRuns={actionRuns}
                activeRunId={activeActionRunId}
                activeRunActions={activeActionRunActions}
                isActionLoading={isActionLoading}
                auditPreviewThinking={auditPreviewThinking}
                auditPreviewAnswer={auditPreviewAnswer}
                onAuditFocusChange={setAuditFocus}
                onRunAudit={runAudit}
                onCancelAudit={cancelAuditStream}
                onSelectRun={onSelectActionRun}
                onActionApprove={(actionId) =>
                  onRunActionOperation(actionId, "approve")
                }
                onActionReject={(actionId) =>
                  onRunActionOperation(actionId, "reject")
                }
                onActionRetry={(actionId) =>
                  onRunActionOperation(actionId, "retry")
                }
                onActionRollback={(actionId) =>
                  onRunActionOperation(actionId, "rollback")
                }
              />
            )}
          </div>
        </div>
      ) : (
        <Button type="button" onClick={() => setIsOpen(true)}>
          AI Assistant
        </Button>
      )}
    </div>
  );
}
