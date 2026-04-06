type SseState = {
  pendingText: string;
  eventDataLines: string[];
};

type AiSsePayload = {
  done: boolean;
  thinkingToken: string;
  answerToken: string;
};

type SsePayloadHandler = (payload: string) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readStringField(
  value: Record<string, unknown>,
  key: string
): string | null {
  const field = value[key];
  return typeof field === "string" ? field : null;
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractChoiceContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const textChunks: string[] = [];
  for (const item of content) {
    if (!isRecord(item)) continue;
    if (item.type === "text" && typeof item.text === "string") {
      textChunks.push(item.text);
    }
  }
  return textChunks.join("\n");
}

function extractTokensFromResponsePayload(payload: unknown): {
  thinkingToken: string;
  answerToken: string;
} {
  if (typeof payload === "string") {
    return { thinkingToken: "", answerToken: payload };
  }
  if (!isRecord(payload)) {
    return { thinkingToken: "", answerToken: "" };
  }

  const response = readStringField(payload, "response");
  if (response !== null) {
    return { thinkingToken: "", answerToken: response };
  }

  const outputText = readStringField(payload, "output_text");
  if (outputText !== null) {
    return { thinkingToken: "", answerToken: outputText };
  }

  const text = readStringField(payload, "text");
  if (text !== null) {
    return { thinkingToken: "", answerToken: text };
  }

  const result = payload.result;
  if (isRecord(result)) {
    const nested = extractTokensFromResponsePayload(result);
    if (nested.answerToken || nested.thinkingToken) return nested;
  }

  if (Array.isArray(payload.choices) && payload.choices.length > 0) {
    const first = payload.choices[0];
    if (isRecord(first)) {
      if (isRecord(first.delta)) {
        let thinkingToken = "";
        let answerToken = "";

        const deltaReasoningContent = first.delta.reasoning_content;
        if (typeof deltaReasoningContent === "string") {
          thinkingToken = deltaReasoningContent;
        } else {
          const deltaReasoningText = extractChoiceContent(deltaReasoningContent);
          if (deltaReasoningText) thinkingToken = deltaReasoningText;
        }

        const deltaReasoning = first.delta.reasoning;
        if (!thinkingToken && typeof deltaReasoning === "string") {
          thinkingToken = deltaReasoning;
        } else if (!thinkingToken) {
          const deltaReasoningArray = extractChoiceContent(deltaReasoning);
          if (deltaReasoningArray) thinkingToken = deltaReasoningArray;
        }

        const deltaContent = first.delta.content;
        if (typeof deltaContent === "string") {
          answerToken = deltaContent;
        } else {
          const deltaChoiceContent = extractChoiceContent(deltaContent);
          if (deltaChoiceContent) answerToken = deltaChoiceContent;
        }

        if (answerToken || thinkingToken) return { thinkingToken, answerToken };
      }

      if (isRecord(first.message)) {
        const choiceContent = extractChoiceContent(first.message.content);
        if (choiceContent) {
          return { thinkingToken: "", answerToken: choiceContent };
        }
      }
      const choiceText = readStringField(first, "text");
      if (choiceText !== null) {
        return { thinkingToken: "", answerToken: choiceText };
      }
    }
  }

  return { thinkingToken: "", answerToken: "" };
}

function consumeSseEvent(state: SseState, onPayload: SsePayloadHandler): void {
  if (!state.eventDataLines.length) return;
  const payload = state.eventDataLines.join("\n");
  state.eventDataLines = [];
  onPayload(payload);
}

function consumeSseLine(
  state: SseState,
  line: string,
  onPayload: SsePayloadHandler
): void {
  const lineNoCr = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (lineNoCr.length === 0) {
    consumeSseEvent(state, onPayload);
    return;
  }
  if (!lineNoCr.startsWith("data:")) return;

  const payload = lineNoCr.slice(5);
  state.eventDataLines.push(
    payload.startsWith(" ") ? payload.slice(1) : payload
  );
}

function consumeSseText(
  state: SseState,
  chunk: string,
  onPayload: SsePayloadHandler
): void {
  state.pendingText += chunk;
  let newlineIndex = state.pendingText.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = state.pendingText.slice(0, newlineIndex);
    state.pendingText = state.pendingText.slice(newlineIndex + 1);
    consumeSseLine(state, line, onPayload);
    newlineIndex = state.pendingText.indexOf("\n");
  }
}

function flushSseText(state: SseState, onPayload: SsePayloadHandler): void {
  if (state.pendingText.length > 0) {
    consumeSseLine(state, state.pendingText, onPayload);
    state.pendingText = "";
  }
  consumeSseEvent(state, onPayload);
}

export async function consumeSseByteStream(
  stream: ReadableStream<Uint8Array>,
  onPayload: SsePayloadHandler
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const state: SseState = {
    pendingText: "",
    eventDataLines: [],
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      consumeSseText(state, decoder.decode(value, { stream: true }), onPayload);
    }

    const finalText = decoder.decode();
    if (finalText) {
      consumeSseText(state, finalText, onPayload);
    }
    flushSseText(state, onPayload);
  } finally {
    reader.releaseLock();
  }
}

export function parseAiSsePayload(payload: string): AiSsePayload {
  if (!payload || payload === "[DONE]") {
    return {
      done: payload === "[DONE]",
      thinkingToken: "",
      answerToken: "",
    };
  }

  const parsed = parseJson(payload);
  if (parsed === null) {
    return { done: false, thinkingToken: "", answerToken: payload };
  }

  const tokens = extractTokensFromResponsePayload(parsed);
  return {
    done: false,
    thinkingToken: tokens.thinkingToken,
    answerToken: tokens.answerToken,
  };
}

export function mergeStreamToken(
  current: string,
  incoming: string
): { next: string; delta: string } {
  if (!incoming) {
    return { next: current, delta: "" };
  }
  if (current && incoming.startsWith(current)) {
    return {
      next: incoming,
      delta: incoming.slice(current.length),
    };
  }
  return {
    next: `${current}${incoming}`,
    delta: incoming,
  };
}

export function encodeSseDataEvent(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

export function encodeSseDoneEvent(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n");
}
