import assert from "node:assert/strict";
import test from "node:test";

import { buildTeamAiAssistantMessages } from "./prompts.ts";

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
