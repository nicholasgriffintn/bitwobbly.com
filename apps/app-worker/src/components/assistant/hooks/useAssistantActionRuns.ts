import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import type { AiActionItem, AiActionRunSummary } from "@/lib/ai-assistant-chat";
import {
  approveAiActionFn,
  getAiActionRunFn,
  listAiActionRunsFn,
  rejectAiActionFn,
  retryAiActionFn,
  rollbackAiActionFn,
} from "@/server/functions/ai-actions";

import {
  parseActionRunItems,
  parseActionRunSummaries,
} from "../lib/action-run-parsers";

type ActionOperation = "approve" | "reject" | "retry" | "rollback";

type UseAssistantActionRunsResult = {
  actionRuns: AiActionRunSummary[];
  activeActionRunId: string | null;
  activeActionRunActions: AiActionItem[];
  isActionLoading: boolean;
  syncActionRuns: (payload: unknown) => Promise<void>;
  refreshActionRuns: () => Promise<void>;
  loadActionRun: (runId: string) => Promise<void>;
  runActionOperation: (actionId: string, operation: ActionOperation) => Promise<void>;
};

export function useAssistantActionRuns(): UseAssistantActionRunsResult {
  const [actionRuns, setActionRuns] = useState<AiActionRunSummary[]>([]);
  const [activeActionRunId, setActiveActionRunId] = useState<string | null>(null);
  const [activeActionRunActions, setActiveActionRunActions] = useState<AiActionItem[]>(
    []
  );
  const [isActionLoading, setIsActionLoading] = useState(false);

  const listActionRuns = useServerFn(listAiActionRunsFn);
  const getActionRun = useServerFn(getAiActionRunFn);
  const approveAction = useServerFn(approveAiActionFn);
  const rejectAction = useServerFn(rejectAiActionFn);
  const retryAction = useServerFn(retryAiActionFn);
  const rollbackAction = useServerFn(rollbackAiActionFn);

  const loadActionRun = async (runId: string) => {
    setIsActionLoading(true);
    try {
      const response = await getActionRun({
        data: { runId },
      });
      const actions = parseActionRunItems(response);
      setActiveActionRunId(runId);
      setActiveActionRunActions(actions);
    } finally {
      setIsActionLoading(false);
    }
  };

  const syncActionRuns = async (payload: unknown) => {
    const summaries = parseActionRunSummaries(payload);
    setActionRuns(summaries);

    if (!summaries.length) {
      setActiveActionRunId(null);
      setActiveActionRunActions([]);
      return;
    }

    const selected =
      activeActionRunId && summaries.some((run) => run.id === activeActionRunId)
        ? activeActionRunId
        : summaries[0].id;
    await loadActionRun(selected);
  };

  const refreshActionRuns = async () => {
    const response = await listActionRuns({
      data: { limit: 30 },
    });
    await syncActionRuns(response);
  };

  const runActionOperation = async (
    actionId: string,
    operation: ActionOperation
  ) => {
    if (operation === "approve") {
      await approveAction({ data: { actionId } });
    } else if (operation === "reject") {
      await rejectAction({ data: { actionId } });
    } else if (operation === "retry") {
      await retryAction({ data: { actionId } });
    } else {
      await rollbackAction({ data: { actionId } });
    }
    await refreshActionRuns();

    if (
      (operation === "approve" || operation === "retry") &&
      activeActionRunId
    ) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const response = await getActionRun({
          data: { runId: activeActionRunId },
        });
        const actions = parseActionRunItems(response);
        setActiveActionRunActions(actions);
        const target = actions.find((action) => action.id === actionId);
        if (
          !target ||
          (target.status !== "approved" && target.status !== "executing")
        ) {
          break;
        }
      }
      await refreshActionRuns();
    }
  };

  return {
    actionRuns,
    activeActionRunId,
    activeActionRunActions,
    isActionLoading,
    syncActionRuns,
    refreshActionRuns,
    loadActionRun,
    runActionOperation,
  };
}
