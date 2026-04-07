import { env } from "cloudflare:workers";

import {
  isRecord,
  makeAiActionCommandEvent,
  toAiActionCommandMessage,
} from "@bitwobbly/shared";

type ActionQueueBinding = {
  send: (body: unknown) => Promise<void>;
};

function isActionQueueBinding(value: unknown): value is ActionQueueBinding {
  return isRecord(value) && typeof value.send === "function";
}

function getActionQueue(): ActionQueueBinding {
  const queue = Reflect.get(env, "ACTION_TRIGGER_JOBS");
  if (!isActionQueueBinding(queue)) {
    throw new Error("ACTION_TRIGGER_JOBS queue is not configured");
  }
  return queue;
}

export async function enqueueActionCommand(input: {
  teamId: string;
  actionId: string;
  operation: "approve" | "reject" | "cancel" | "retry" | "rollback";
  userId?: string | null;
}): Promise<void> {
  const queue = getActionQueue();
  await queue.send(
    toAiActionCommandMessage(
      makeAiActionCommandEvent({
        teamId: input.teamId,
        actionId: input.actionId,
        operation: input.operation,
        requestedByUserId: input.userId ?? null,
      })
    )
  );
}
