import assert from "node:assert/strict";
import test from "node:test";

import {
  aiTriggerDedupeTtlSeconds,
  enqueueAiActionTriggerWithCooldown,
} from "./ai-action-trigger.ts";

test("aiTriggerDedupeTtlSeconds uses short cooldown for non-incident keys", () => {
  assert.equal(
    aiTriggerDedupeTtlSeconds("monitor_recovered:mon_1:none"),
    15 * 60
  );
});

test("aiTriggerDedupeTtlSeconds uses long cooldown for incident keys", () => {
  assert.equal(
    aiTriggerDedupeTtlSeconds("monitor_recovered:mon_1:inc_123"),
    60 * 60 * 24 * 2
  );
});

test("enqueueAiActionTriggerWithCooldown queues trigger and stores dedupe key", async () => {
  const sentMessages: unknown[] = [];
  const kvPutCalls: Array<{
    key: string;
    value: string;
    options?: { expirationTtl?: number };
  }> = [];

  const queued = await enqueueAiActionTriggerWithCooldown(
    {
      queue: {
        send: async (message) => {
          sentMessages.push(message);
        },
      },
      dedupeStore: {
        get: async () => null,
        put: async (key, value, options) => {
          kvPutCalls.push({ key, value, options });
        },
      },
    },
    {
      source: "monitor_transition",
      type: "monitor_recovered",
      teamId: "team_1",
      idempotencyKey: "monitor_recovered:mon_1:none",
      metadata: {
        monitorId: "mon_1",
        incidentId: null,
      },
    }
  );

  assert.equal(queued, true);
  assert.equal(sentMessages.length, 1);
  assert.equal(kvPutCalls.length, 1);
  assert.deepEqual(kvPutCalls[0], {
    key: "dedupe:ai_trigger:monitor_recovered:mon_1:none",
    value: "1",
    options: { expirationTtl: 15 * 60 },
  });
});

test("enqueueAiActionTriggerWithCooldown skips already deduped triggers", async () => {
  const sentMessages: unknown[] = [];

  const queued = await enqueueAiActionTriggerWithCooldown(
    {
      queue: {
        send: async (message) => {
          sentMessages.push(message);
        },
      },
      dedupeStore: {
        get: async () => "1",
        put: async () => {
          throw new Error("put should not be called when dedupe key exists");
        },
      },
    },
    {
      source: "monitor_transition",
      type: "monitor_down",
      teamId: "team_1",
      idempotencyKey: "monitor_down:mon_1:inc_123",
      metadata: {
        monitorId: "mon_1",
        incidentId: "inc_123",
      },
    }
  );

  assert.equal(queued, false);
  assert.equal(sentMessages.length, 0);
});

