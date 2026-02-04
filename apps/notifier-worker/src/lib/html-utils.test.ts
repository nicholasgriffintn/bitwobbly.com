import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml } from "./html-utils.ts";

test("escapeHtml escapes ampersand", () => {
  assert.equal(escapeHtml("foo & bar"), "foo &amp; bar");
});

test("escapeHtml escapes less than", () => {
  assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
});

test("escapeHtml escapes greater than", () => {
  assert.equal(escapeHtml("a > b"), "a &gt; b");
});

test("escapeHtml escapes double quotes", () => {
  assert.equal(escapeHtml('say "hello"'), "say &quot;hello&quot;");
});

test("escapeHtml escapes single quotes", () => {
  assert.equal(escapeHtml("it's"), "it&#039;s");
});

test("escapeHtml handles multiple special characters", () => {
  const input = '<script>alert("XSS & stuff")</script>';
  const expected =
    "&lt;script&gt;alert(&quot;XSS &amp; stuff&quot;)&lt;/script&gt;";
  assert.equal(escapeHtml(input), expected);
});

test("escapeHtml handles empty string", () => {
  assert.equal(escapeHtml(""), "");
});

test("escapeHtml leaves plain text unchanged", () => {
  assert.equal(escapeHtml("Hello World"), "Hello World");
});
