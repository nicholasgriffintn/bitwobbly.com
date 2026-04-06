import assert from "node:assert/strict";
import test from "node:test";

import { extractAiTextContent, extractAiTextResponse } from "./response.ts";

test("extractAiTextResponse reads direct response field", () => {
  const output = extractAiTextResponse({ response: "hello world" });
  assert.equal(output, "hello world");
});

test("extractAiTextResponse reads choices message content arrays", () => {
  const output = extractAiTextResponse({
    choices: [
      {
        message: {
          content: [
            { type: "text", text: "part 1" },
            { type: "text", text: "part 2" },
          ],
        },
      },
    ],
  });
  assert.equal(output, "part 1\npart 2");
});

test("extractAiTextResponse falls back to stringified payload", () => {
  const output = extractAiTextResponse({ ok: true, value: 3 });
  assert.match(output, /"ok": true/);
  assert.match(output, /"value": 3/);
});

test("extractAiTextContent keeps token whitespace for streaming chunks", () => {
  const output = extractAiTextContent({ response: " hello " });
  assert.equal(output, " hello ");
});
