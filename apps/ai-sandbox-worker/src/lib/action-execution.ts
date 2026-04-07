import {
  completeTeamAiActionAttempt,
  createTeamAiActionAttempt,
  createTeamAiActionEvent,
  getDb,
  getTeamAiAction,
  getTeamAiActionAttemptByIdempotency,
  getTeamAiActionPolicy,
  nowIso,
  updateTeamAiAction,
  type TeamAiAction,
} from "@bitwobbly/shared";

import { executeSandboxedAction } from "./executor";
import type { Env } from "../types/env";

export async function executeActionAndPersist(input: {
  env: Env;
  runId: string;
  action: TeamAiAction;
}): Promise<TeamAiAction> {
  const db = getDb(input.env.DB, { withSentry: true });
  const policy = await getTeamAiActionPolicy(db, input.action.teamId);
  const attemptKey = `${input.action.idempotencyKey}:attempt:${input.action.updatedAt}`;
  const existingAttempt = await getTeamAiActionAttemptByIdempotency(db, attemptKey);
  if (existingAttempt) {
    const existingAction = await getTeamAiAction(db, input.action.teamId, input.action.id);
    if (existingAction) return existingAction;
  }

  await updateTeamAiAction(db, {
    teamId: input.action.teamId,
    actionId: input.action.id,
    status: "executing",
  });
  await createTeamAiActionEvent(db, {
    runId: input.runId,
    teamId: input.action.teamId,
    actionId: input.action.id,
    eventType: "action_execution_started",
    message: `Executing action '${input.action.title}' in dynamic sandbox`,
  });

  const attempt = await createTeamAiActionAttempt(db, {
    actionId: input.action.id,
    idempotencyKey: attemptKey,
    status: "running",
    request: {
      actionType: input.action.actionType,
      actionId: input.action.id,
    },
  });

  try {
    const executionResult = await executeSandboxedAction({
      env: input.env,
      action: input.action,
      policy,
    });
    await completeTeamAiActionAttempt(db, {
      attemptId: attempt.id,
      status: "completed",
      response: executionResult,
    });
    await updateTeamAiAction(db, {
      teamId: input.action.teamId,
      actionId: input.action.id,
      status: "completed",
      executedAt: nowIso(),
    });
    await createTeamAiActionEvent(db, {
      runId: input.runId,
      teamId: input.action.teamId,
      actionId: input.action.id,
      eventType: "action_execution_completed",
      message: "Action execution completed",
      data: executionResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeTeamAiActionAttempt(db, {
      attemptId: attempt.id,
      status: "failed",
      error: message,
    });
    await updateTeamAiAction(db, {
      teamId: input.action.teamId,
      actionId: input.action.id,
      status: "failed",
      failedAt: nowIso(),
    });
    await createTeamAiActionEvent(db, {
      runId: input.runId,
      teamId: input.action.teamId,
      actionId: input.action.id,
      eventType: "action_execution_failed",
      level: "error",
      message: `Action execution failed: ${message}`,
      data: { error: message },
    });
  }

  const latest = await getTeamAiAction(db, input.action.teamId, input.action.id);
  if (!latest) {
    throw new Error(`Action not found after execution: ${input.action.id}`);
  }
  return latest;
}
