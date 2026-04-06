import {
  consumeSseByteStream,
  mergeStreamToken,
  parseAiSsePayload,
} from "@/lib/ai-sse";
import type { AssistantTokenChannel } from "@/lib/ai-assistant-chat";

type StreamCallbacks = {
  onToken: (token: string, channel: AssistantTokenChannel) => void;
  onComplete: () => void;
};

async function readErrorResponse(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
    ) {
      return payload.error;
    }
  } catch {
    // ignore parse errors and fall back to status text
  }
  return response.statusText || "Request failed";
}

async function consumeAiSseStream(
  response: Response,
  callbacks: StreamCallbacks
): Promise<void> {
  if (!response.body) {
    throw new Error("Streaming response body is missing");
  }

  let answer = "";
  let thinking = "";
  await consumeSseByteStream(response.body, (payload) => {
    const parsed = parseAiSsePayload(payload);
    if (parsed.done) return;

    if (parsed.thinkingToken) {
      const nextThinking = mergeStreamToken(thinking, parsed.thinkingToken);
      thinking = nextThinking.next;
      if (nextThinking.delta) {
        callbacks.onToken(nextThinking.delta, "thinking");
      }
    }

    if (parsed.answerToken) {
      const nextAnswer = mergeStreamToken(answer, parsed.answerToken);
      answer = nextAnswer.next;
      if (nextAnswer.delta) {
        callbacks.onToken(nextAnswer.delta, "answer");
      }
    }
  });

  callbacks.onComplete();
}

export async function streamAiAssistantAnswer(
  question: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const response = await fetch("/api/ai-assistant/stream", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    throw new Error(await readErrorResponse(response));
  }

  await consumeAiSseStream(response, callbacks);
}
