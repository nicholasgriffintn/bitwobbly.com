import {
  TeamAiActionRunStatusSchema,
  TeamAiActionStatusSchema,
} from "@bitwobbly/shared";
import { z } from "zod";

import type { AiActionItem, AiActionRunSummary } from "@/lib/ai-assistant-chat";

const ActionRunSummarySchema = z.object({
  id: z.string().min(1),
  triggerSource: z.string().min(1),
  triggerType: z.string().min(1),
  status: TeamAiActionRunStatusSchema,
  createdAt: z.string().min(1),
});

const ActionRunListResponseSchema = z.object({
  runs: z.array(ActionRunSummarySchema),
});

const ActionItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  actionType: z.string().min(1),
  riskTier: z.string().min(1),
  status: TeamAiActionStatusSchema,
  requiresApproval: z.boolean(),
});

const ActionRunDetailsResponseSchema = z.object({
  actions: z.array(ActionItemSchema),
});

function toActionRunSummary(
  run: z.infer<typeof ActionRunSummarySchema>
): AiActionRunSummary {
  return {
    id: run.id,
    triggerSource: run.triggerSource,
    triggerType: run.triggerType,
    status: run.status,
    createdAt: run.createdAt,
  };
}

function toActionItem(action: z.infer<typeof ActionItemSchema>): AiActionItem {
  return {
    id: action.id,
    title: action.title,
    actionType: action.actionType,
    riskTier: action.riskTier,
    status: action.status,
    requiresApproval: action.requiresApproval,
  };
}

export function parseActionRunSummaries(input: unknown): AiActionRunSummary[] {
  const parsed = ActionRunListResponseSchema.parse(input);
  return parsed.runs.map(toActionRunSummary);
}

export function parseActionRunItems(input: unknown): AiActionItem[] {
  const parsed = ActionRunDetailsResponseSchema.parse(input);
  return parsed.actions.map(toActionItem);
}
