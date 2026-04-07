import {
  listTeamAiActions,
  nowIso,
  updateTeamAiActionRun,
  type TeamAiAction,
  type TeamAiActionRunStatus,
} from "@bitwobbly/shared";

import type { DB } from "@bitwobbly/shared";

export function deriveRunStatus(actions: TeamAiAction[]): TeamAiActionRunStatus {
  if (!actions.length) return "blocked";
  if (actions.some((action) => action.status === "executing")) return "executing";
  if (actions.some((action) => action.status === "failed")) return "failed";
  if (actions.some((action) => action.status === "pending")) return "awaiting_approval";
  if (actions.some((action) => action.status === "approved")) return "executing";
  if (actions.every((action) => action.status === "blocked")) return "blocked";
  if (
    actions.every((action) =>
      ["completed", "rolled_back", "cancelled"].includes(action.status)
    )
  ) {
    return "completed";
  }
  return "awaiting_approval";
}

export async function refreshRunStatus(
  db: DB,
  teamId: string,
  runId: string
): Promise<void> {
  const actions = await listTeamAiActions(db, teamId, { runId, limit: 200 });
  const nextStatus = deriveRunStatus(actions);
  const completedAt =
    nextStatus === "completed" || nextStatus === "blocked" ? nowIso() : undefined;
  await updateTeamAiActionRun(db, {
    teamId,
    runId,
    status: nextStatus,
    completedAt,
  });
}
