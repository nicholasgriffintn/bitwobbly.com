import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAiUsageFromResponsePayload,
  parseAiUsageFromSsePayload,
} from "./usage.ts";

test("extractAiUsageFromResponsePayload reads top-level usage", () => {
  const usage = extractAiUsageFromResponsePayload({
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  });

  assert.deepEqual(usage, {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  });
});

test("extractAiUsageFromResponsePayload reads nested usage from result", () => {
  const usage = extractAiUsageFromResponsePayload({
    result: {
      usage: {
        input_tokens: 4,
        output_tokens: 9,
      },
    },
  });

  assert.deepEqual(usage, {
    input_tokens: 4,
    output_tokens: 9,
  });
});

test("extractAiUsageFromResponsePayload returns null without usage fields", () => {
  const usage = extractAiUsageFromResponsePayload({
    response: "hello",
    choices: [],
  });
  assert.equal(usage, null);
});

test("parseAiUsageFromSsePayload returns null for [DONE]", () => {
  const usage = parseAiUsageFromSsePayload("[DONE]");
  assert.equal(usage, null);
});

test("parseAiUsageFromSsePayload returns null for invalid JSON", () => {
  const usage = parseAiUsageFromSsePayload("{not-json");
  assert.equal(usage, null);
});

test("parseAiUsageFromSsePayload parses usage from SSE JSON payload", () => {
  const usage = parseAiUsageFromSsePayload(
    JSON.stringify({
      result: {
        usage: {
          prompt_tokens: 2,
          completion_tokens: 3,
          total_tokens: 5,
        },
      },
    })
  );

  assert.deepEqual(usage, {
    prompt_tokens: 2,
    completion_tokens: 3,
    total_tokens: 5,
  });
});
