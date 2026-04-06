export type AssistantTokenChannel = "thinking" | "answer";

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking: string;
};

export type AiAssistantRun = {
  id: string;
  runType: "manual_query" | "manual_audit" | "auto_audit";
  question: string | null;
  answer: string;
  model: string;
  createdAt: string;
};

export type AssistantTab = "chat" | "ops";

export const ASSISTANT_SUGGESTED_PROMPTS = [
  "Summarise current risks in our monitoring setup.",
  "How should we improve alert routing and notification noise?",
  "Do our grouping rules look likely to over-group issues?",
] as const;

export function createAssistantMessageId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function appendAssistantStreamToken(
  messages: AssistantMessage[],
  id: string,
  token: string,
  channel: AssistantTokenChannel
): AssistantMessage[] {
  return messages.map((message) => {
    if (message.id !== id) return message;

    return {
      ...message,
      content:
        channel === "answer" ? `${message.content}${token}` : message.content,
      thinking:
        channel === "thinking"
          ? `${message.thinking}${token}`
          : message.thinking,
    };
  });
}

export function hasAssistantMessageOutput(message: AssistantMessage): boolean {
  return (
    message.content.trim().length > 0 || message.thinking.trim().length > 0
  );
}

export function runTypeLabel(runType: AiAssistantRun["runType"]): string {
  if (runType === "manual_query") return "Manual query";
  if (runType === "manual_audit") return "Manual audit";
  return "Auto audit";
}
