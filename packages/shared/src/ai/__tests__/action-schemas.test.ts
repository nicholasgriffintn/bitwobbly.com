import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyTeamAiActionGate,
  parseAiActionTriggerEvent,
  parseStrictTeamAiActionPlan,
  shouldAllowEgress,
} from "../action-schemas.ts";

test("parseAiActionTriggerEvent validates trigger payload shape", () => {
  const event = parseAiActionTriggerEvent({
    id: "evt_1",
    source: "monitor_transition",
    type: "monitor_down",
    teamId: "team_1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    idempotencyKey: "monitor:team_1:mon_1:down:1704067200",
    metadata: { monitorId: "mon_1" },
  });

  assert.equal(event.source, "monitor_transition");
  assert.equal(event.type, "monitor_down");
});

test("parseStrictTeamAiActionPlan extracts JSON from fenced model output", () => {
  const plan = parseStrictTeamAiActionPlan({
    response: "```json\n{\"summary\":\"Plan looks good\",\"actions\":[{\"actionType\":\"monitor_tuning\",\"riskTier\":\"low\",\"title\":\"Tune interval\",\"description\":\"Lower probe interval\",\"rationale\":\"Reduce blind spots\",\"payload\":{\"monitorId\":\"m1\"}}]}\n```",
  });

  assert.equal(plan.summary, "Plan looks good");
  assert.equal(plan.actions[0].actionType, "monitor_tuning");
});

test("classifyTeamAiActionGate blocks by explicit policy blocklist", () => {
  const gate = classifyTeamAiActionGate({
    actionType: "run_sql",
    riskTier: "low",
    policy: {
      teamId: "team_1",
      autoActionsEnabled: true,
      executionMode: "risk_based",
      lowRiskAutoEnabled: true,
      blockedActionTypes: ["run_sql", "shell_command"],
      egressAllowlist: ["api.github.com"],
      githubAutofixEnabled: false,
      createdAt: null,
      updatedAt: null,
    },
  });

  assert.equal(gate.decision, "blocked");
  assert.match(gate.reason || "", /blocked by team policy/i);
});

test("classifyTeamAiActionGate requires approval for non-low risk", () => {
  const gate = classifyTeamAiActionGate({
    actionType: "notification_routing",
    riskTier: "medium",
    policy: {
      teamId: "team_1",
      autoActionsEnabled: true,
      executionMode: "risk_based",
      lowRiskAutoEnabled: true,
      blockedActionTypes: [],
      egressAllowlist: ["api.github.com"],
      githubAutofixEnabled: true,
      createdAt: null,
      updatedAt: null,
    },
  });

  assert.equal(gate.decision, "approval_required");
});

test("shouldAllowEgress supports exact host and subdomain matching", () => {
  assert.equal(shouldAllowEgress("https://api.github.com/repos/a/b", ["api.github.com"]), true);
  assert.equal(shouldAllowEgress("https://uploads.github.com/files", ["github.com"]), true);
  assert.equal(shouldAllowEgress("https://example.com", ["github.com"]), false);
});
