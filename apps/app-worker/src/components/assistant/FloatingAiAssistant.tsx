import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { TabNav } from "@/components/navigation";
import { Button } from "@/components/ui";
import {
  appendAssistantStreamToken,
  createAssistantMessageId,
  hasAssistantMessageOutput,
  type AiAssistantRun,
  type AssistantMessage,
  type AssistantTab,
} from "@/lib/ai-assistant-chat";
import { streamAiAssistantAnswer } from "@/lib/ai-assistant-stream-client";
import {
  getAiAssistantSettingsFn,
  runAiAssistantAuditFn,
} from "@/server/functions/ai-assistant";
import { AssistantChatTab } from "./AssistantChatTab";
import { AssistantOpsTab } from "./AssistantOpsTab";

function getLatestAuditRun(runs: AiAssistantRun[]): AiAssistantRun | null {
  return (
    runs.find(
      (run) => run.runType === "manual_audit" || run.runType === "auto_audit"
    ) ?? null
  );
}

export function FloatingAiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AssistantTab>("chat");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [lastAuditAt, setLastAuditAt] = useState<number | null>(null);
  const [runs, setRuns] = useState<AiAssistantRun[]>([]);
  const [auditFocus, setAuditFocus] = useState("");
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<
    string | null
  >(null);

  const getAiSettings = useServerFn(getAiAssistantSettingsFn);
  const runAudit = useServerFn(runAiAssistantAuditFn);

  useEffect(() => {
    if (!isOpen || isEnabled !== null) return;
    let isMounted = true;

    const loadSettings = async () => {
      setIsInitializing(true);
      setError(null);
      try {
        const response = await getAiSettings();
        if (!isMounted) return;
        setIsEnabled(response.settings.enabled);
        setModel(response.settings.model);
        setLastAuditAt(response.settings.lastAutoAuditAt);
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
  const showSuggestedPrompts =
    isEnabled === true &&
    !isLoading &&
    question.trim().length === 0 &&
    messages.length === 0;
  const latestAudit = useMemo(() => getLatestAuditRun(runs), [runs]);

  const sendQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || !canSend) return;

    const assistantId = createAssistantMessageId("assistant");
    setQuestion("");
    setError(null);
    setIsLoading(true);
    setActiveAssistantMessageId(assistantId);
    setMessages((prev) => [
      ...prev,
      {
        id: createAssistantMessageId("user"),
        role: "user",
        content: trimmed,
        thinking: "",
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        thinking: "",
      },
    ]);

    try {
      await streamAiAssistantAnswer(trimmed, {
        onToken: (token, channel) => {
          if (!token) return;
          setMessages((prev) =>
            appendAssistantStreamToken(prev, assistantId, token, channel)
          );
        },
        onComplete: () => {
          // no-op
        },
      });

      void getAiSettings()
        .then((refreshed) => {
          setIsEnabled(refreshed.settings.enabled);
          setModel(refreshed.settings.model);
          setLastAuditAt(refreshed.settings.lastAutoAuditAt);
          setRuns(refreshed.latestRuns);
        })
        .catch(() => {
          // keep chat completion responsive even if metadata refresh fails
        });
    } catch (err) {
      setMessages((prev) =>
        prev.filter(
          (message) =>
            message.id !== assistantId || hasAssistantMessageOutput(message)
        )
      );
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setActiveAssistantMessageId(null);
    }
  };

  const onRunAudit = async () => {
    if (isEnabled !== true) return;
    setError(null);
    setIsRunningAudit(true);
    try {
      const response = await runAudit({
        data: {
          focus: auditFocus.trim() || undefined,
        },
      });
      setRuns((prev) => [response.run, ...prev].slice(0, 10));
      setLastAuditAt(Math.floor(Date.now() / 1000));
      setAuditFocus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunningAudit(false);
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
                  { id: "ops", label: "Ops", count: runs.length },
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
                showSuggestedPrompts={showSuggestedPrompts}
                activeAssistantMessageId={activeAssistantMessageId}
                onQuestionChange={setQuestion}
                onSend={sendQuestion}
              />
            ) : (
              <AssistantOpsTab
                isEnabled={isEnabled}
                model={model}
                lastAuditAt={lastAuditAt}
                auditFocus={auditFocus}
                isRunningAudit={isRunningAudit}
                isLoading={isLoading}
                runs={runs}
                latestAudit={latestAudit}
                onAuditFocusChange={setAuditFocus}
                onRunAudit={onRunAudit}
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
