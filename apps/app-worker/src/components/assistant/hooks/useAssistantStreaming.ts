import { useEffect, useRef, useState } from "react";

import {
  appendAssistantStreamToken,
  buildManualAuditPrompt,
  createAssistantMessageId,
  hasAssistantMessageOutput,
  type AiAssistantRun,
  type AssistantMessage,
} from "@/lib/ai-assistant-chat";
import { isAbortError } from "@/lib/abort-utils";
import { streamAiAssistantAnswer } from "@/lib/ai-assistant-stream-client";

type UseAssistantStreamingInput = {
  isEnabled: boolean | null;
  refreshMetadata: () => Promise<void>;
  onClearError: () => void;
  onError: (message: string) => void;
};

type UseAssistantStreamingResult = {
  question: string;
  setQuestion: (value: string) => void;
  messages: AssistantMessage[];
  isLoading: boolean;
  auditFocus: string;
  setAuditFocus: (value: string) => void;
  isRunningAudit: boolean;
  auditPreviewThinking: string;
  auditPreviewAnswer: string;
  activeAssistantMessageId: string | null;
  sendQuestion: () => Promise<void>;
  runAudit: () => Promise<void>;
  cancelChatStream: () => void;
  cancelAuditStream: () => void;
  openPastChat: (run: AiAssistantRun) => void;
};

export function useAssistantStreaming(
  input: UseAssistantStreamingInput
): UseAssistantStreamingResult {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [auditFocus, setAuditFocus] = useState("");
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [auditPreviewThinking, setAuditPreviewThinking] = useState("");
  const [auditPreviewAnswer, setAuditPreviewAnswer] = useState("");
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<
    string | null
  >(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const auditAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      chatAbortControllerRef.current?.abort();
      auditAbortControllerRef.current?.abort();
    };
  }, []);

  const sendQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || isLoading || input.isEnabled !== true) return;

    const assistantId = createAssistantMessageId("assistant");
    const abortController = new AbortController();
    setQuestion("");
    input.onClearError();
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

      void input.refreshMetadata().catch(() => {
        // keep chat completion responsive even if metadata refresh fails
      });
    } catch (error) {
      if (isAbortError(error)) {
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
      input.onError(error instanceof Error ? error.message : String(error));
    } finally {
      if (chatAbortControllerRef.current === abortController) {
        chatAbortControllerRef.current = null;
      }
      setIsLoading(false);
      setActiveAssistantMessageId(null);
    }
  };

  const runAudit = async () => {
    if (input.isEnabled !== true) return;

    const auditPrompt = buildManualAuditPrompt(auditFocus);
    const abortController = new AbortController();
    input.onClearError();
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

      await input.refreshMetadata();
      setAuditFocus("");
    } catch (error) {
      if (isAbortError(error)) return;
      input.onError(error instanceof Error ? error.message : String(error));
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

    input.onClearError();
    setQuestion("");
    setActiveAssistantMessageId(null);
    setMessages(restoredMessages);
  };

  return {
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
  };
}
