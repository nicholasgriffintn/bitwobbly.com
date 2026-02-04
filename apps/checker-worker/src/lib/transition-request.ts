import { isRecord } from "./guards";

export type TransitionRequest = {
  team_id: string;
  monitor_id: string;
  status: "up" | "down";
  reason?: string;
};

export function parseTransitionRequest(
  value: unknown
): TransitionRequest | null {
  if (!isRecord(value)) return null;
  const team_id = typeof value.team_id === "string" ? value.team_id : null;
  const monitor_id =
    typeof value.monitor_id === "string" ? value.monitor_id : null;
  const status =
    value.status === "up" || value.status === "down" ? value.status : null;
  const reason = typeof value.reason === "string" ? value.reason : undefined;

  if (!team_id || !monitor_id || !status) return null;
  return { team_id, monitor_id, status, reason };
}
