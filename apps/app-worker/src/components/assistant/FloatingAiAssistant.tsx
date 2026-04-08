import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui";
import {
  type AiAssistantRun,
  isManualQueryRun,
} from "@/lib/ai-assistant-chat";
import { getAiAssistantSettingsFn } from "@/server/functions/ai-assistant";

import { AssistantChatTab } from "./AssistantChatTab";
import { useAssistantStreaming } from "./hooks/useAssistantStreaming";

export function FloatingAiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<AiAssistantRun[]>([]);

  const getAiSettings = useServerFn(getAiAssistantSettingsFn);

  const applySettingsSnapshot = (settings: {
    enabled: boolean;
  }) => {
    setIsEnabled(settings.enabled);
  };

  const refreshMetadata = async () => {
    const refreshed = await getAiSettings();
    applySettingsSnapshot(refreshed.settings);
    setRuns(refreshed.latestRuns);
  };

  const {
    question,
    setQuestion,
    messages,
    isLoading,
    activeAssistantMessageId,
    sendQuestion,
    cancelChatStream,
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
  }, [getAiSettings, isEnabled, isOpen]);

  const canSend = useMemo(
    () => !!question.trim() && !isLoading && isEnabled === true,
    [isEnabled, isLoading, question]
  );
  const manualQueryRuns = useMemo(() => runs.filter(isManualQueryRun), [runs]);
  const showSuggestedPrompts =
    isEnabled === true &&
    !isLoading &&
    question.trim().length === 0 &&
    messages.length === 0;

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
            {error && <div className="assistant-panel-error form-error">{error}</div>}
            <div className="assistant-panel-error">
              <div className="assistant-empty-state">
                Audit runs and action approvals are now in{" "}
                <Link to="/app/ai-audit">AI Audit</Link>.
              </div>
            </div>
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
