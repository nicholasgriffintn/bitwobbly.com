import {
  createTeamAiActionEvent,
  getDb,
  getTeamAiAction,
  getTeamAiActionRun,
  nowIso,
  updateTeamAiAction,
  type AiActionCommandEvent,
} from "@bitwobbly/shared";

import { executeActionAndPersist } from "./action-execution";
import { refreshRunStatus } from "./action-run-status";
import type { Env } from "../types/env";

export async function handleCommandMessage(
  env: Env,
  command: AiActionCommandEvent
): Promise<void> {
  const db = getDb(env.DB, { withSentry: true });
  const action = await getTeamAiAction(db, command.teamId, command.actionId);
  if (!action) return;

  const run = await getTeamAiActionRun(db, command.teamId, action.runId);
  if (!run) return;

  if (command.operation === "approve") {
    await updateTeamAiAction(db, {
      teamId: command.teamId,
      actionId: action.id,
      status: "approved",
      approvedByUserId: command.requestedByUserId ?? null,
      approvedAt: nowIso(),
    });
    await createTeamAiActionEvent(db, {
      runId: run.id,
      teamId: command.teamId,
      actionId: action.id,
      eventType: "action_approved",
      message: `Action approved by ${command.requestedByUserId ?? "unknown user"}`,
    });
    const refreshed = await getTeamAiAction(db, command.teamId, action.id);
    if (refreshed) {
      await executeActionAndPersist({ env, runId: run.id, action: refreshed });
    }
  } else if (command.operation === "retry") {
    await updateTeamAiAction(db, {
      teamId: command.teamId,
      actionId: action.id,
      status: "pending",
      failedAt: null,
    });
    await createTeamAiActionEvent(db, {
      runId: run.id,
      teamId: command.teamId,
      actionId: action.id,
      eventType: "action_retry_requested",
      message: "Retry requested",
    });
    const refreshed = await getTeamAiAction(db, command.teamId, action.id);
    if (refreshed) {
      await executeActionAndPersist({ env, runId: run.id, action: refreshed });
    }
  } else if (command.operation === "rollback") {
    await updateTeamAiAction(db, {
      teamId: command.teamId,
      actionId: action.id,
      status: "rolled_back",
      rolledBackAt: nowIso(),
    });
    await createTeamAiActionEvent(db, {
      runId: run.id,
      teamId: command.teamId,
      actionId: action.id,
      eventType: "action_rollback_completed",
      message: "Rollback marked as completed",
    });
  } else if (command.operation === "reject" || command.operation === "cancel") {
    await updateTeamAiAction(db, {
      teamId: command.teamId,
      actionId: action.id,
      status: "cancelled",
    });
    await createTeamAiActionEvent(db, {
      runId: run.id,
      teamId: command.teamId,
      actionId: action.id,
      eventType: "action_cancelled",
      message: `Action ${command.operation}ed by user`,
    });
  }

  await refreshRunStatus(db, command.teamId, run.id);
}
