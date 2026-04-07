import type { TeamAiActionPlan } from "@bitwobbly/shared";

export function toSerializableRecord(
  value: Record<string, unknown> | null
): { [key: string]: {} } | null {
  if (!value) return null;

  const serialised: { [key: string]: {} } = {};
  for (const [key, entry] of Object.entries(value)) {
    serialised[key] = entry ?? {};
  }
  return serialised;
}

export function toSerializableSnapshot(
  snapshot: Record<string, unknown> | null
): { [key: string]: {} } | null {
  return toSerializableRecord(snapshot);
}

export function toSerializablePlan(plan: TeamAiActionPlan | null) {
  if (!plan) return null;

  return {
    summary: plan.summary,
    actions: plan.actions.map((action) => ({
      actionType: action.actionType,
      riskTier: action.riskTier,
      title: action.title,
      description: action.description,
      rationale: action.rationale,
      payload: toSerializableRecord(action.payload) ?? {},
      rollback: action.rollback
        ? {
            strategy: action.rollback.strategy,
            payload: toSerializableRecord(action.rollback.payload ?? null) ?? undefined,
          }
        : action.rollback ?? null,
    })),
  };
}
