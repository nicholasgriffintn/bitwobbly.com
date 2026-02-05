import assert from "node:assert/strict";
import test from "node:test";

import { isHttpUrl } from "./url-utils.ts";

test("isHttpUrl accepts http/https URLs", () => {
  assert.equal(isHttpUrl("http://example.com"), true);
  assert.equal(isHttpUrl("https://example.com/path"), true);
});

test("isHttpUrl rejects non-http URLs", () => {
  assert.equal(isHttpUrl("ftp://example.com"), false);
  assert.equal(isHttpUrl("file:///etc/passwd"), false);
});

test("isHttpUrl rejects invalid URLs", () => {
  assert.equal(isHttpUrl("not a url"), false);
});
