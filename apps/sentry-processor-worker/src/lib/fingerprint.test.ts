import assert from "node:assert/strict";
import test from "node:test";

import {
  computeFingerprint,
  extractCulprit,
  generateTitle,
} from "./fingerprint";

test("respects custom fingerprint from SDK payload", () => {
  const fingerprint = computeFingerprint({
    fingerprint: ["payments", "checkout-timeout"],
    message: "Should not be used",
  });

  assert.equal(fingerprint, "custom::payments::checkout-timeout");
});

test("normalises dynamic values in exception message", () => {
  const fingerprintA = computeFingerprint({
    exception: {
      values: [
        {
          type: "TypeError",
          value: "Order 12345 failed for user 550e8400-e29b-41d4-a716-446655440000",
        },
      ],
    },
  });

  const fingerprintB = computeFingerprint({
    exception: {
      values: [
        {
          type: "TypeError",
          value: "Order 99999 failed for user 550e8400-e29b-41d4-a716-446655440001",
        },
      ],
    },
  });

  assert.equal(fingerprintA, fingerprintB);
});

test("includes top in-app frame in fingerprint and culprit", () => {
  const event = {
    exception: {
      values: [
        {
          type: "Error",
          value: "Unhandled",
          stacktrace: {
            frames: [
              { module: "vendor.lib", function: "a", in_app: false },
              { module: "checkout.flow", function: "submit", in_app: true },
            ],
          },
        },
      ],
    },
  };

  const fingerprint = computeFingerprint(event);
  const culprit = extractCulprit(event);

  assert.match(fingerprint, /frame:checkout\.flow/);
  assert.equal(culprit, "checkout.flow");
});

test("builds readable title from exception", () => {
  const title = generateTitle({
    exception: {
      values: [{ type: "ReferenceError", value: "foo is not defined" }],
    },
  });

  assert.equal(title, "ReferenceError: foo is not defined");
});
