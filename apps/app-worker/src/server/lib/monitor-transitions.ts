import {
  randomId,
  type DB,
  type MonitorAlertJob,
} from "@bitwobbly/shared";

import {
  findOpenIncidentForMonitor,
  createIncident,
  addIncidentUpdate,
} from "../repositories/incidents";
import {
  getMonitorStateById,
  setMonitorIncidentOpen,
  upsertMonitorStateFromStatusUpdate,
} from "../repositories/monitors";
import { clearAllStatusPageCaches } from "../repositories/status-pages";

export type IncomingMonitorStatus = "up" | "down" | "degraded";

export interface MonitorTransitionInput {
  status: IncomingMonitorStatus;
  prevFailures: number;
  incidentOpen: boolean;
  failureThreshold?: number | null;
}

export interface MonitorTransitionDecision {
  nextFailures: number;
  shouldOpenIncident: boolean;
  shouldResolveIncident: boolean;
}

export function computeMonitorTransition(
  input: MonitorTransitionInput,
): MonitorTransitionDecision {
  const threshold = Math.max(1, Math.min(10, input.failureThreshold ?? 3));
  const isDownLike = input.status !== "up";
  const nextFailures = isDownLike ? input.prevFailures + 1 : 0;

  return {
    nextFailures,
    shouldOpenIncident:
      isDownLike && nextFailures >= threshold && !input.incidentOpen,
    shouldResolveIncident: input.status === "up" && input.incidentOpen,
  };
}

async function openMonitorIncident(
  db: DB,
  kv: KVNamespace,
  teamId: string,
  monitorId: string,
  reason?: string,
) {
  const existing = await findOpenIncidentForMonitor(db, teamId, monitorId);
  if (existing) {
    await setMonitorIncidentOpen(db, monitorId, true);
    await clearAllStatusPageCaches(db, kv, teamId);
    return existing;
  }

  const created = await createIncident(db, teamId, {
    statusPageId: undefined,
    monitorId,
    title: "Monitor down",
    status: "investigating",
    message: reason || "Automated monitoring detected an outage.",
  });

  await setMonitorIncidentOpen(db, monitorId, true);

  await clearAllStatusPageCaches(db, kv, teamId);
  return created.id;
}

async function resolveMonitorIncident(
  db: DB,
  kv: KVNamespace,
  teamId: string,
  monitorId: string,
) {
  const incidentId = await findOpenIncidentForMonitor(db, teamId, monitorId);
  if (!incidentId) {
    await setMonitorIncidentOpen(db, monitorId, false);
    return null;
  }

  await addIncidentUpdate(db, teamId, incidentId, {
    message: "Service has recovered.",
    status: "resolved",
  });

  await setMonitorIncidentOpen(db, monitorId, false);

  await clearAllStatusPageCaches(db, kv, teamId);
  return incidentId;
}

export async function processMonitorStatusUpdate(params: {
  db: DB;
  kv: KVNamespace;
  alertJobs: { send: (job: MonitorAlertJob) => Promise<void> };
  monitor: {
    id: string;
    teamId: string;
    failureThreshold?: number | null;
  };
  status: IncomingMonitorStatus;
  reason?: string;
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const prev = await getMonitorStateById(params.db, params.monitor.id);
  const decision = computeMonitorTransition({
    status: params.status,
    prevFailures: prev?.consecutiveFailures ?? 0,
    incidentOpen: (prev?.incidentOpen ?? 0) === 1,
    failureThreshold: params.monitor.failureThreshold,
  });

  await upsertMonitorStateFromStatusUpdate(params.db, params.monitor.id, {
    nowSec,
    status: params.status,
    consecutiveFailures: decision.nextFailures,
    lastError: params.reason ?? null,
  });

  if (decision.shouldOpenIncident) {
    const incidentId = await openMonitorIncident(
      params.db,
      params.kv,
      params.monitor.teamId,
      params.monitor.id,
      params.reason ??
        (params.status === "degraded"
          ? "Service is degraded."
          : "Service is down."),
    );

    await params.alertJobs.send({
      type: "monitor",
      alert_id: randomId("al"),
      team_id: params.monitor.teamId,
      monitor_id: params.monitor.id,
      status: "down",
      reason: params.reason,
      incident_id: incidentId,
    });
    return;
  }

  if (decision.shouldResolveIncident) {
    const incidentId = await resolveMonitorIncident(
      params.db,
      params.kv,
      params.monitor.teamId,
      params.monitor.id,
    );

    await params.alertJobs.send({
      type: "monitor",
      alert_id: randomId("al"),
      team_id: params.monitor.teamId,
      monitor_id: params.monitor.id,
      status: "up",
      reason: "Recovered",
      incident_id: incidentId ?? undefined,
    });
  }
}
