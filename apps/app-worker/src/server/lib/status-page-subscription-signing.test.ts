import test from "node:test";
import assert from "node:assert/strict";

import {
  statusPageUnsubscribeSig,
  verifyStatusPageUnsubscribeSig,
} from "./status-page-subscription-signing.ts";

test("statusPageUnsubscribeSig is stable for same inputs", async () => {
  const sig1 = await statusPageUnsubscribeSig("secret", "sps_123");
  const sig2 = await statusPageUnsubscribeSig("secret", "sps_123");
  assert.equal(sig1, sig2);
  assert.equal(typeof sig1, "string");
  assert.ok(sig1.length >= 64);
});

test("verifyStatusPageUnsubscribeSig rejects wrong sig", async () => {
  const ok = await verifyStatusPageUnsubscribeSig("secret", "sps_123", "nope");
  assert.equal(ok, false);
});

test("verifyStatusPageUnsubscribeSig accepts correct sig", async () => {
  const sig = await statusPageUnsubscribeSig("secret", "sps_123");
  const ok = await verifyStatusPageUnsubscribeSig("secret", "sps_123", sig);
  assert.equal(ok, true);
});
