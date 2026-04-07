import {
  buildTeamAiActionPlanMessages,
  extractAiUsageFromResponsePayload,
  parseStrictTeamAiActionPlan,
  serialiseError,
  type TeamAiActionPlan,
  type TeamAiActionPolicy,
  type TeamAiAssistantContextSnapshot,
  type TeamAiAssistantSettings,
  type AiActionTriggerEvent,
} from "@bitwobbly/shared";

import type { AiBinding } from "../types/env";

type PlannerInput = {
  ai: AiBinding;
  model: string;
  trigger: AiActionTriggerEvent;
  snapshot: TeamAiAssistantContextSnapshot;
  settings: TeamAiAssistantSettings;
  policy: TeamAiActionPolicy;
};

export async function generateActionPlan(input: PlannerInput): Promise<{
  plan: TeamAiActionPlan;
  tokenUsage: Record<string, unknown> | null;
}> {
  let lastError: unknown = null;
  const baseMessages = buildTeamAiActionPlanMessages({
    trigger: input.trigger,
    snapshot: input.snapshot,
    policy: input.policy,
    customInstructions: input.settings.customInstructions,
  });

  let messages = baseMessages;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await input.ai.run(input.model, {
        messages,
        temperature: 0.05,
        max_completion_tokens: 3000,
      });
      const plan = parseStrictTeamAiActionPlan(response);
      return {
        plan,
        tokenUsage: extractAiUsageFromResponsePayload(response),
      };
    } catch (error) {
      lastError = error;
      messages = [
        ...baseMessages,
        {
          role: "user",
          content: `Previous output was invalid JSON. Error: ${serialiseError(error).message}. Return valid JSON matching the schema with no prose.`,
        },
      ];
    }
  }

  throw new Error(
    `Action planner failed after retries: ${serialiseError(lastError).message}`
  );
}
