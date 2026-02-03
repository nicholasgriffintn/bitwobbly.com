import assert from "node:assert/strict";
import test from "node:test";

import { computeMonitorTransition } from "./monitor-transitions";

test("opens incident when down-like failures reach threshold", () => {
  const decision = computeMonitorTransition({
    status: "down",
    prevFailures: 2,
    incidentOpen: false,
    failureThreshold: 3,
  });

  assert.equal(decision.nextFailures, 3);
  assert.equal(decision.shouldOpenIncident, true);
  assert.equal(decision.shouldResolveIncident, false);
});

test("resolves incident on recovery", () => {
  const decision = computeMonitorTransition({
    status: "up",
    prevFailures: 5,
    incidentOpen: true,
    failureThreshold: 3,
  });

  assert.equal(decision.nextFailures, 0);
  assert.equal(decision.shouldOpenIncident, false);
  assert.equal(decision.shouldResolveIncident, true);
});

test("treats degraded as down-like for threshold handling", () => {
  const decision = computeMonitorTransition({
    status: "degraded",
    prevFailures: 0,
    incidentOpen: false,
    failureThreshold: 1,
  });

  assert.equal(decision.nextFailures, 1);
  assert.equal(decision.shouldOpenIncident, true);
  assert.equal(decision.shouldResolveIncident, false);
});
