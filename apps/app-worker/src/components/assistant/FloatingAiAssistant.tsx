import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { TabNav } from "@/components/navigation";
import { Button } from "@/components/ui";
import {
  type AiAssistantRun,
  appendAssistantStreamToken,
  buildManualAuditPrompt,
  createAssistantMessageId,
  hasAssistantMessageOutput,
  isAuditRun,
  isManualQueryRun,
  type AssistantMessage,
  type AssistantTab,
} from "@/lib/ai-assistant-chat";
import { isAbortError } from "@/lib/abort-utils";
import { streamAiAssistantAnswer } from "@/lib/ai-assistant-stream-client";
import { getAiAssistantSettingsFn } from "@/server/functions/ai-assistant";
import { AssistantChatTab } from "./AssistantChatTab";
import { AssistantOpsTab } from "./AssistantOpsTab";

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
  const [auditPreviewThinking, setAuditPreviewThinking] = useState("");
  const [auditPreviewAnswer, setAuditPreviewAnswer] = useState("");
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<
    string | null
  >(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const auditAbortControllerRef = useRef<AbortController | null>(null);

  const getAiSettings = useServerFn(getAiAssistantSettingsFn);

  useEffect(() => {
    return () => {
      chatAbortControllerRef.current?.abort();
      auditAbortControllerRef.current?.abort();
    };
  }, []);

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
  const auditRuns = useMemo(() => runs.filter(isAuditRun), [runs]);
  const manualQueryRuns = useMemo(() => runs.filter(isManualQueryRun), [runs]);
  const showSuggestedPrompts =
    isEnabled === true &&
    !isLoading &&
    question.trim().length === 0 &&
    messages.length === 0;

  const sendQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || !canSend) return;

    const assistantId = createAssistantMessageId("assistant");
    const abortController = new AbortController();
    setQuestion("");
    setError(null);
    setIsLoading(true);
    setActiveAssistantMessageId(assistantId);
    chatAbortControllerRef.current = abortController;
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
      await streamAiAssistantAnswer(
        trimmed,
        {
          onToken: (token, channel) => {
            if (!token) return;
            setMessages((prev) =>
              appendAssistantStreamToken(prev, assistantId, token, channel)
            );
          },
          onComplete: () => {
            // no-op
          },
        },
        { mode: "query", signal: abortController.signal }
      );

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
      if (isAbortError(err)) {
        setMessages((prev) =>
          prev.filter(
            (message) =>
              message.id !== assistantId || hasAssistantMessageOutput(message)
          )
        );
        return;
      }
      setMessages((prev) =>
        prev.filter(
          (message) =>
            message.id !== assistantId || hasAssistantMessageOutput(message)
        )
      );
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (chatAbortControllerRef.current === abortController) {
        chatAbortControllerRef.current = null;
      }
      setIsLoading(false);
      setActiveAssistantMessageId(null);
    }
  };

  const onRunAudit = async () => {
    if (isEnabled !== true) return;

    const auditPrompt = buildManualAuditPrompt(auditFocus);
    const abortController = new AbortController();
    setError(null);
    setIsRunningAudit(true);
    setAuditPreviewThinking("");
    setAuditPreviewAnswer("");
    auditAbortControllerRef.current = abortController;
    try {
      await streamAiAssistantAnswer(
        auditPrompt,
        {
          onToken: (token, channel) => {
            if (!token) return;
            if (channel === "thinking") {
              setAuditPreviewThinking((prev) => `${prev}${token}`);
              return;
            }
            setAuditPreviewAnswer((prev) => `${prev}${token}`);
          },
          onComplete: () => {
            // no-op
          },
        },
        { mode: "audit", signal: abortController.signal }
      );

      const refreshed = await getAiSettings();
      setIsEnabled(refreshed.settings.enabled);
      setModel(refreshed.settings.model);
      setLastAuditAt(refreshed.settings.lastAutoAuditAt);
      setRuns(refreshed.latestRuns);
      setAuditFocus("");
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (auditAbortControllerRef.current === abortController) {
        auditAbortControllerRef.current = null;
      }
      setIsRunningAudit(false);
    }
  };

  const cancelChatStream = () => {
    chatAbortControllerRef.current?.abort();
  };

  const cancelAuditStream = () => {
    auditAbortControllerRef.current?.abort();
  };

  const openPastChat = (run: AiAssistantRun) => {
    if (isLoading) return;
    const restoredQuestion = run.question?.trim() ?? "";
    const restoredMessages: AssistantMessage[] = [];

    if (restoredQuestion) {
      restoredMessages.push({
        id: createAssistantMessageId("user"),
        role: "user",
        content: restoredQuestion,
        thinking: "",
      });
    }

    restoredMessages.push({
      id: createAssistantMessageId("assistant"),
      role: "assistant",
      content: run.answer,
      thinking: "",
    });

    setError(null);
    setQuestion("");
    setActiveAssistantMessageId(null);
    setMessages(restoredMessages);
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
                auditPreviewThinking={auditPreviewThinking}
                auditPreviewAnswer={auditPreviewAnswer}
                onAuditFocusChange={setAuditFocus}
                onRunAudit={onRunAudit}
                onCancelAudit={cancelAuditStream}
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
