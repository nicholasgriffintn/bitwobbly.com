import type { Queue } from "@cloudflare/workers-types";
import { enqueueAiActionTrigger } from "@bitwobbly/shared";
import type { AiActionWorkerMessage } from "@bitwobbly/shared";

type MonitorTransitionAiTrigger = {
  source: "monitor_transition";
  type: "monitor_down" | "monitor_recovered";
  teamId: string;
  idempotencyKey: string;
  metadata: {
    monitorId: string;
    incidentId: string | null;
    reason?: string | null;
  };
};

type TriggerQueue = Pick<Queue<AiActionWorkerMessage>, "send">;

type TriggerDedupeStore = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
};

export function aiTriggerDedupeTtlSeconds(idempotencyKey: string): number {
  if (idempotencyKey.endsWith(":none")) {
    return 15 * 60;
  }
  return 60 * 60 * 24 * 2;
}

export async function enqueueAiActionTriggerWithCooldown(
  deps: {
    queue: TriggerQueue;
    dedupeStore: TriggerDedupeStore;
  },
  trigger: MonitorTransitionAiTrigger
): Promise<boolean> {
  const dedupeKey = `dedupe:ai_trigger:${trigger.idempotencyKey}`;
  const alreadyQueued = await deps.dedupeStore.get(dedupeKey);
  if (alreadyQueued) return false;

  await enqueueAiActionTrigger(deps.queue, trigger);
  await deps.dedupeStore.put(dedupeKey, "1", {
    expirationTtl: aiTriggerDedupeTtlSeconds(trigger.idempotencyKey),
  });
  return true;
}
