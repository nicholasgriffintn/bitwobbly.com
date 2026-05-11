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
        <Button
          type="button"
          variant="outline"
          className="assistant-fab-button"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI operations assistant"
          title="Open AI operations assistant"
        >
          <svg
            className="assistant-fab-icon"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 3.75L13.72 8.28L18.25 10L13.72 11.72L12 16.25L10.28 11.72L5.75 10L10.28 8.28L12 3.75Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <path
              d="M18.25 14.25L19.03 16.22L21 17L19.03 17.78L18.25 19.75L17.47 17.78L15.5 17L17.47 16.22L18.25 14.25Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M5.75 14.75H9.25C10.08 14.75 10.75 15.42 10.75 16.25V18.25C10.75 19.08 10.08 19.75 9.25 19.75H6.75L4.25 21V16.25C4.25 15.42 4.92 14.75 5.75 14.75Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      )}
    </div>
  );
}
