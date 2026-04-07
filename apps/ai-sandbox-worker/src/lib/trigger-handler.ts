import {
  buildTeamAiAssistantContextSnapshot,
  classifyTeamAiActionGate,
  createTeamAiAction,
  createTeamAiActionEvent,
  createTeamAiActionRun,
  findTeamAiActionRunByTrigger,
  getDb,
  getTeamAiActionPolicy,
  getTeamAiAssistantSettings,
  toRecordOrNull,
  updateTeamAiActionRun,
  type AiActionTriggerEvent,
  type TeamAiActionStatus,
} from "@bitwobbly/shared";

import { executeActionAndPersist } from "./action-execution";
import { generateActionPlan } from "./plan";
import { refreshRunStatus } from "./action-run-status";
import type { Env } from "../types/env";

function toActionStatus(
  decision: "auto" | "approval_required" | "blocked"
): TeamAiActionStatus {
  if (decision === "blocked") return "blocked";
  return "pending";
}

export async function handleTriggerMessage(
  env: Env,
  trigger: AiActionTriggerEvent
): Promise<void> {
  const db = getDb(env.DB, { withSentry: true });
  const existingRun = await findTeamAiActionRunByTrigger(db, {
    teamId: trigger.teamId,
    triggerSource: trigger.source,
    triggerType: trigger.type,
    triggerId: trigger.id,
  });
  if (existingRun) return;

  const settings = await getTeamAiAssistantSettings(db, trigger.teamId);
  const policy = await getTeamAiActionPolicy(db, trigger.teamId);
  const run = await createTeamAiActionRun(db, {
    teamId: trigger.teamId,
    triggerSource: trigger.source,
    triggerType: trigger.type,
    triggerId: trigger.id,
    status: "planning",
    policy,
  });
  await createTeamAiActionEvent(db, {
    runId: run.id,
    teamId: trigger.teamId,
    eventType: "trigger_received",
    message: `Received ${trigger.source}:${trigger.type}`,
    data: { triggerId: trigger.id, idempotencyKey: trigger.idempotencyKey },
  });

  try {
    const snapshot = await buildTeamAiAssistantContextSnapshot(
      db,
      trigger.teamId,
      settings
    );
    const snapshotRecord = toRecordOrNull(snapshot);
    if (!snapshotRecord) {
      throw new Error("Assistant snapshot is not serialisable");
    }

    const planned = await generateActionPlan({
      ai: env.AI,
      model: settings.model,
      trigger,
      snapshot,
      settings,
      policy,
    });

    await updateTeamAiActionRun(db, {
      teamId: trigger.teamId,
      runId: run.id,
      snapshot: snapshotRecord,
      plan: planned.plan,
      status: "executing",
    });
    await createTeamAiActionEvent(db, {
      runId: run.id,
      teamId: trigger.teamId,
      eventType: "plan_generated",
      message: "Generated action plan",
      data: {
        actions: planned.plan.actions.length,
        tokenUsage: planned.tokenUsage,
      },
    });

    for (let index = 0; index < planned.plan.actions.length; index += 1) {
      const item = planned.plan.actions[index];
      const gate = classifyTeamAiActionGate({
        actionType: item.actionType,
        riskTier: item.riskTier,
        policy,
      });
      const action = await createTeamAiAction(db, {
        runId: run.id,
        teamId: trigger.teamId,
        actionType: item.actionType,
        riskTier: item.riskTier,
        title: item.title,
        description: item.description,
        payload: {
          ...item.payload,
          rollback: item.rollback ?? null,
        },
        gateDecision: gate.decision,
        status: toActionStatus(gate.decision),
        blockedReason: gate.reason,
        requiresApproval: gate.decision !== "auto",
        idempotencyKey: `${trigger.idempotencyKey}:${index}:${item.actionType}`,
      });

      await createTeamAiActionEvent(db, {
        runId: run.id,
        teamId: trigger.teamId,
        actionId: action.id,
        eventType: "action_gated",
        message: `Gate decision: ${gate.decision}`,
        data: { reason: gate.reason, riskTier: item.riskTier },
      });

      if (gate.decision === "auto") {
        await executeActionAndPersist({
          env,
          runId: run.id,
          action,
        });
      }
    }

    await refreshRunStatus(db, trigger.teamId, run.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTeamAiActionRun(db, {
      teamId: trigger.teamId,
      runId: run.id,
      status: "failed",
      error: message,
    });
    await createTeamAiActionEvent(db, {
      runId: run.id,
      teamId: trigger.teamId,
      eventType: "run_failed",
      level: "error",
      message: `Run failed: ${message}`,
      data: { error: message },
    });
    throw error;
  }
}
