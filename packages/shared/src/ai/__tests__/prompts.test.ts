import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTeamAiActionPlanMessages,
  buildTeamAiAssistantMessages,
} from "../prompts.ts";

test("buildTeamAiAssistantMessages includes question and custom instructions", () => {
  const messages = buildTeamAiAssistantMessages({
    mode: "query",
    question: "What monitor should be grouped together?",
    customInstructions: "Prioritise low-noise alerting.",
    snapshot: {
      capturedAt: 1,
      team: { id: "team_1", name: "Core Team" },
    },
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.match(messages[1].content, /What monitor should be grouped together\?/);
  assert.match(messages[1].content, /Prioritise low-noise alerting\./);
  assert.match(messages[1].content, /"team_1"/);
});

test("buildTeamAiAssistantMessages uses audit instruction for audit mode", () => {
  const messages = buildTeamAiAssistantMessages({
    mode: "audit",
    snapshot: {
      capturedAt: 1,
      team: { id: "team_1", name: "Core Team" },
    },
  });

  assert.match(messages[1].content, /proactive monitoring configuration audit/i);
});

test("buildTeamAiActionPlanMessages enforces strict JSON response", () => {
  const messages = buildTeamAiActionPlanMessages({
    trigger: {
      id: "evt_1",
      source: "assistant_audit",
      type: "audit_completed",
      teamId: "team_1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      idempotencyKey: "evt_1",
      metadata: { auditRunId: "tai_1" },
    },
    snapshot: {
      capturedAt: 1,
      team: { id: "team_1", name: "Core Team" },
    },
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

  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /Return ONLY strict JSON/i);
  assert.match(messages[1].content, /\"type\":\"audit_completed\"/);
  assert.match(messages[1].content, /\"executionMode\":\"risk_based\"/);
});
