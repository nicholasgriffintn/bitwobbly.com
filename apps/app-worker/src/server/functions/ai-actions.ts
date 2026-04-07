import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import {
  createTeamAiActionEvent,
  deleteTeamAiGithubRepoMapping,
  getTeamAiAction,
  getTeamAiActionPolicy,
  getTeamAiActionRun,
  listTeamAiActionEvents,
  listTeamAiActionRuns,
  listTeamAiActions,
  listTeamAiGithubRepoMappings,
  parseTeamAiGithubRepoMappingInput,
  parseTeamAiPolicyUpdate,
  upsertTeamAiActionPolicy,
  upsertTeamAiGithubRepoMapping,
} from "@bitwobbly/shared";
import { getDb } from "@bitwobbly/shared";

import { enqueueActionCommand } from "../lib/ai-action-commands";
import {
  toSerializablePlan,
  toSerializableRecord,
  toSerializableSnapshot,
} from "../lib/ai-action-serialisers";
import { requireTeam } from "../lib/auth-middleware";

const ListActionRunsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

const GetActionRunInputSchema = z.object({
  runId: z.string().min(1).max(120),
});

const ActionOperationInputSchema = z.object({
  actionId: z.string().min(1).max(120),
});

const DeleteGithubMappingInputSchema = z.object({
  id: z.string().min(1).max(120),
});

type ActionOperation = "approve" | "reject" | "cancel" | "retry" | "rollback";

const operationEvents: Record<ActionOperation, { eventType: string; messagePrefix: string }> = {
  approve: {
    eventType: "approval_requested",
    messagePrefix: "Approval requested by",
  },
  reject: {
    eventType: "rejection_requested",
    messagePrefix: "Rejection requested by",
  },
  cancel: {
    eventType: "cancel_requested",
    messagePrefix: "Cancel requested by",
  },
  retry: {
    eventType: "retry_requested",
    messagePrefix: "Retry requested by",
  },
  rollback: {
    eventType: "rollback_requested",
    messagePrefix: "Rollback requested by",
  },
};

async function requestActionOperation(input: {
  actionId: string;
  operation: ActionOperation;
}): Promise<{ ok: true }> {
  const { teamId, userId } = await requireTeam();
  const db = getDb(env.DB);
  const action = await getTeamAiAction(db, teamId, input.actionId);
  if (!action) {
    throw new Error("Action not found");
  }

  await enqueueActionCommand({
    teamId,
    actionId: input.actionId,
    operation: input.operation,
    userId,
  });

  const event = operationEvents[input.operation];
  await createTeamAiActionEvent(db, {
    runId: action.runId,
    teamId,
    actionId: action.id,
    eventType: event.eventType,
    message: `${event.messagePrefix} ${userId ?? "unknown user"}`,
  });

  return { ok: true };
}

export const getAiActionPolicyFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const policy = await getTeamAiActionPolicy(db, teamId);
    return { policy };
  }
);

export const updateAiActionPolicyFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseTeamAiPolicyUpdate(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const policy = await upsertTeamAiActionPolicy(db, teamId, data);
    return { policy };
  });

export const listAiActionRunsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => ListActionRunsInputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const runs = await listTeamAiActionRuns(db, teamId, { limit: data.limit });
    return {
      runs: runs.map((run) => ({
        ...run,
        snapshot: toSerializableSnapshot(run.snapshot),
        plan: toSerializablePlan(run.plan),
      })),
    };
  });

export const getAiActionRunFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetActionRunInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const run = await getTeamAiActionRun(db, teamId, data.runId);
    if (!run) {
      throw new Error("Action run not found");
    }

    const [actions, events] = await Promise.all([
      listTeamAiActions(db, teamId, { runId: data.runId, limit: 200 }),
      listTeamAiActionEvents(db, teamId, { runId: data.runId, limit: 500 }),
    ]);

    return {
      run: {
        ...run,
        snapshot: toSerializableSnapshot(run.snapshot),
        plan: toSerializablePlan(run.plan),
      },
      actions: actions.map((action) => ({
        ...action,
        payload: toSerializableRecord(action.payload),
      })),
      events: events.map((event) => ({
        ...event,
        data: toSerializableRecord(event.data),
      })),
    };
  });

export const approveAiActionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ActionOperationInputSchema.parse(data))
  .handler(async ({ data }) =>
    requestActionOperation({ actionId: data.actionId, operation: "approve" })
  );

export const rejectAiActionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ActionOperationInputSchema.parse(data))
  .handler(async ({ data }) =>
    requestActionOperation({ actionId: data.actionId, operation: "reject" })
  );

export const cancelAiActionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ActionOperationInputSchema.parse(data))
  .handler(async ({ data }) =>
    requestActionOperation({ actionId: data.actionId, operation: "cancel" })
  );

export const retryAiActionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ActionOperationInputSchema.parse(data))
  .handler(async ({ data }) =>
    requestActionOperation({ actionId: data.actionId, operation: "retry" })
  );

export const rollbackAiActionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ActionOperationInputSchema.parse(data))
  .handler(async ({ data }) =>
    requestActionOperation({ actionId: data.actionId, operation: "rollback" })
  );

export const listAiGithubMappingsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const mappings = await listTeamAiGithubRepoMappings(db, teamId);
    return { mappings };
  }
);

export const upsertAiGithubMappingFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseTeamAiGithubRepoMappingInput(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const mapping = await upsertTeamAiGithubRepoMapping(db, teamId, data);
    return { mapping };
  });

export const deleteAiGithubMappingFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DeleteGithubMappingInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const deleted = await deleteTeamAiGithubRepoMapping(db, teamId, data.id);
    return { deleted };
  });
