import { nowIso, randomId } from "../lib/utils.ts";
import type {
  AiActionCommandEvent,
  AiActionTriggerEvent,
  AiActionWorkerMessage,
} from "./types.ts";

export function makeAiActionTriggerEvent(
  input: Omit<AiActionTriggerEvent, "id" | "occurredAt">
): AiActionTriggerEvent {
  return {
    id: randomId("aevt"),
    occurredAt: nowIso(),
    ...input,
  };
}

export function makeAiActionCommandEvent(
  input: Omit<AiActionCommandEvent, "id" | "occurredAt">
): AiActionCommandEvent {
  return {
    id: randomId("acmd"),
    occurredAt: nowIso(),
    ...input,
  };
}

export function toAiActionTriggerMessage(
  trigger: AiActionTriggerEvent
): AiActionWorkerMessage {
  return {
    kind: "trigger",
    trigger,
  };
}

export function toAiActionCommandMessage(
  command: AiActionCommandEvent
): AiActionWorkerMessage {
  return {
    kind: "command",
    command,
  };
}

export async function enqueueAiActionTrigger(
  queue: { send: (message: AiActionWorkerMessage) => Promise<void> },
  input: Omit<AiActionTriggerEvent, "id" | "occurredAt">
): Promise<void> {
  await queue.send(
    toAiActionTriggerMessage(
      makeAiActionTriggerEvent({
        source: input.source,
        type: input.type,
        teamId: input.teamId,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      })
    )
  );
}
