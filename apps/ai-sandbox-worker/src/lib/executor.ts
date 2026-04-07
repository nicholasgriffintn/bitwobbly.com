import {
  createLogger,
  type TeamAiAction,
  type TeamAiActionPolicy,
} from "@bitwobbly/shared";

import type { Env } from "../types/env";
import { executeGithubAutofixAction } from "./executors/github-autofix";
import { executeInternalSandboxAction } from "./executors/internal-actions";

const logger = createLogger({ service: "ai-sandbox-worker" });

export async function executeSandboxedAction(input: {
  env: Env;
  action: TeamAiAction;
  policy: TeamAiActionPolicy;
}): Promise<Record<string, unknown>> {
  switch (input.action.actionType) {
    case "monitor_tuning":
    case "notification_routing":
    case "sentry_grouping_update":
    case "incident_runbook_update":
      return executeInternalSandboxAction(input);

    case "github_autofix":
      return executeGithubAutofixAction(input);

    case "run_sql":
    case "shell_command":
      throw new Error(`Action type ${input.action.actionType} cannot run in sandbox`);

    default:
      logger.warn("unsupported action type", {
        actionType: input.action.actionType,
      });
      throw new Error(`Unsupported action type: ${input.action.actionType}`);
  }
}
