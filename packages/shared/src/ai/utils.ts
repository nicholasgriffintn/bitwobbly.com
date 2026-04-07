import type { TeamAiAssistantRunType, TeamAiAssistantRunStatus } from "./types.ts";
import { TEAM_AI_ASSISTANT_DEFAULT_MODEL } from "./constants.ts";

export function toRunType(value: string): TeamAiAssistantRunType {
  if (value === "manual_query") return value;
  if (value === "manual_audit") return value;
  if (value === "auto_audit") return value;
  throw new Error(`Invalid AI run type: ${value}`);
}

export function toRunStatus(value: string): TeamAiAssistantRunStatus {
  if (value === "running") return value;
  if (value === "completed") return value;
  if (value === "failed") return value;
  if (value === "cancelled") return value;
  throw new Error(`Invalid AI run status: ${value}`);
}

export function toModelName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : TEAM_AI_ASSISTANT_DEFAULT_MODEL;
}
