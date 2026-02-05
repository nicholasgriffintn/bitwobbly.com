import assert from "node:assert/strict";
import test from "node:test";

import { PayloadTooLargeError, readBodyWithLimit } from "./request-utils.ts";

test("readBodyWithLimit reads body within limit", async () => {
  const payload = new TextEncoder().encode("hello");
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "content-length": String(payload.length),
    },
    body: payload,
  });

  const result = await readBodyWithLimit(request, 1024);
  assert.equal(new TextDecoder().decode(result), "hello");
});

test("readBodyWithLimit throws when content-length exceeds limit", async () => {
  const request = new Request("https://example.com", {
    method: "POST",
    headers: {
      "content-length": "4096",
    },
    body: new TextEncoder().encode("hi"),
  });

  await assert.rejects(
    () => readBodyWithLimit(request, 128),
    PayloadTooLargeError
  );
});
