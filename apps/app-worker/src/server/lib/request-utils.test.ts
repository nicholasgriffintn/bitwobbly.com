import assert from "node:assert/strict";
import test from "node:test";

import { readJsonWithLimit, PayloadTooLargeError } from "./request-utils.ts";

test("readJsonWithLimit parses JSON within limit", async () => {
  const payload = JSON.stringify({ ok: true });
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(payload.length),
    },
    body: payload,
  });

  const result = await readJsonWithLimit(request, 1024);
  assert.deepEqual(result, { ok: true });
});

test("readJsonWithLimit throws when content-length exceeds limit", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": "2048",
    },
    body: "{}",
  });

  await assert.rejects(
    () => readJsonWithLimit(request, 128),
    PayloadTooLargeError
  );
});

test("readJsonWithLimit throws on invalid JSON", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": "1",
    },
    body: "{",
  });

  await assert.rejects(() => readJsonWithLimit(request, 128), SyntaxError);
});
