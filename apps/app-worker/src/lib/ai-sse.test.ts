import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeSseByteStream,
  mergeStreamToken,
  parseAiSsePayload,
} from "./ai-sse.ts";

function streamFromTextChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

test("parseAiSsePayload extracts response text", () => {
  const parsed = parseAiSsePayload('{"response":"hello"}');
  assert.equal(parsed.done, false);
  assert.equal(parsed.answerToken, "hello");
  assert.equal(parsed.thinkingToken, "");
});

test("parseAiSsePayload extracts chat chunk delta content", () => {
  const parsed = parseAiSsePayload(
    '{"id":"chatcmpl_1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"hel"},"finish_reason":null}]}'
  );
  assert.equal(parsed.done, false);
  assert.equal(parsed.answerToken, "hel");
  assert.equal(parsed.thinkingToken, "");
});

test("parseAiSsePayload extracts kimi reasoning_content chunks", () => {
  const parsed = parseAiSsePayload(
    '{"id":"chatcmpl-bfec68e1d08993fd","object":"chat.completion.chunk","created":1775519885,"model":"@cf/moonshotai/kimi-k2.5","choices":[{"index":0,"delta":{"reasoning":":","reasoning_content":":"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":2051,"total_tokens":2185,"completion_tokens":134},"p":"abdefg"}'
  );
  assert.equal(parsed.done, false);
  assert.equal(parsed.thinkingToken, ":");
  assert.equal(parsed.answerToken, "");
});

test("parseAiSsePayload handles done payload", () => {
  const parsed = parseAiSsePayload("[DONE]");
  assert.equal(parsed.done, true);
  assert.equal(parsed.answerToken, "");
  assert.equal(parsed.thinkingToken, "");
});

test("mergeStreamToken handles cumulative payloads", () => {
  const first = mergeStreamToken("", "Hel");
  assert.equal(first.next, "Hel");
  assert.equal(first.delta, "Hel");

  const second = mergeStreamToken(first.next, "Hello");
  assert.equal(second.next, "Hello");
  assert.equal(second.delta, "lo");
});

test("consumeSseByteStream reconstructs split SSE events", async () => {
  const payloads: string[] = [];
  const stream = streamFromTextChunks([
    'data: {"response":"Hel',
    'lo"}\n\n',
    'data: {"response":" world"}\n\n',
    "data: [DONE]\n\n",
  ]);

  await consumeSseByteStream(stream, (payload) => {
    payloads.push(payload);
  });

  assert.deepEqual(payloads, [
    '{"response":"Hello"}',
    '{"response":" world"}',
    "[DONE]",
  ]);
});
