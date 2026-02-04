import type { DB } from "@bitwobbly/shared";

import {
  computeAvailability,
  computeAvailabilityBuckets,
  utcMonthRange,
} from "../lib/availability";
import {
  listIncidentIntervalsForMonitors,
  listMaintenanceIntervalsForScope,
  resolveAvailabilityScope,
  type AvailabilityScopeType,
} from "../repositories/availability";
import { getEffectiveSloTarget } from "../repositories/slo-targets";
import {
  getExternalStatusPageBySlug,
  listComponentsForStatusPage,
} from "../repositories/status-pages";

function clampRange(fromSec: number, toSec: number) {
  const from = Math.floor(fromSec);
  const to = Math.floor(toSec);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Error("Invalid time range");
  }
  const maxRangeSeconds = 366 * 24 * 60 * 60;
  if (to - from > maxRangeSeconds) {
    throw new Error("Range too large (max 366 days)");
  }
  return { from, to };
}

export async function getAvailabilityForScope(
  db: DB,
  teamId: string,
  input: {
    scopeType: AvailabilityScopeType;
    scopeId: string;
    fromSec: number;
    toSec: number;
    bucket: "hour" | "day";
    includeDependencies: boolean;
  },
) {
  const { from, to } = clampRange(input.fromSec, input.toSec);

  const scope = await resolveAvailabilityScope(db, teamId, {
    type: input.scopeType,
    id: input.scopeId,
    includeDependencies: input.includeDependencies,
  });

  const slo = await getEffectiveSloTarget(db, teamId, scope.scope.type, scope.scope.id);

  const downtimeIntervals = await listIncidentIntervalsForMonitors(
    db,
    teamId,
    scope.monitorIds,
    from,
    to,
  );

  const maintenanceIntervals = await listMaintenanceIntervalsForScope(db, teamId, {
    componentIds: scope.componentIds,
    monitorIds: scope.monitorIds,
    monitorGroupIds: scope.monitorGroupIds,
    fromSec: from,
    toSec: to,
  });

  const { summary, downtimeOutsideMaintenance, maintenance } = computeAvailability({
    fromSec: from,
    toSec: to,
    downtimeIntervals,
    maintenanceIntervals,
      targetPpm: slo.slo?.targetPpm ?? null,
    });

  const { buckets, incidentBuckets } = computeAvailabilityBuckets({
    fromSec: from,
    toSec: to,
    downtimeOutsideMaintenance,
    maintenance,
    bucket: input.bucket,
    maxBuckets: 1000,
  });

  return {
    scope: scope.scope,
    range: { from, to },
    summary,
    buckets: buckets.map((b, idx) => ({ ...b, incidents: incidentBuckets[idx] })),
  };
}

export async function getMonthlyAvailabilityReport(
  db: DB,
  teamId: string,
  input: {
    scopeType: AvailabilityScopeType;
    scopeId: string;
    month: string;
    includeDependencies: boolean;
  },
) {
  const { fromSec, toSec } = utcMonthRange(input.month);
  const scope = await resolveAvailabilityScope(db, teamId, {
    type: input.scopeType,
    id: input.scopeId,
    includeDependencies: input.includeDependencies,
  });

  const slo = await getEffectiveSloTarget(db, teamId, scope.scope.type, scope.scope.id);

  const downtimeIntervals = await listIncidentIntervalsForMonitors(
    db,
    teamId,
    scope.monitorIds,
    fromSec,
    toSec,
  );
  const maintenanceIntervals = await listMaintenanceIntervalsForScope(db, teamId, {
    componentIds: scope.componentIds,
    monitorIds: scope.monitorIds,
    monitorGroupIds: scope.monitorGroupIds,
    fromSec,
    toSec,
  });

  const { summary, downtimeOutsideMaintenance, maintenance } = computeAvailability({
    fromSec,
    toSec,
    downtimeIntervals,
    maintenanceIntervals,
    targetPpm: slo.slo?.targetPpm ?? null,
  });

  const { buckets } = computeAvailabilityBuckets({
    fromSec,
    toSec,
    downtimeOutsideMaintenance,
    maintenance,
    bucket: "day",
    maxBuckets: 40,
  });

  const report = {
    month: input.month,
    scope: scope.scope,
    summary,
    days: buckets.map((b) => ({
      date: new Date(b.start * 1000).toISOString().slice(0, 10),
      uptime_percent: b.uptimePercent,
      downtime_minutes: Math.round(b.downtimeSeconds / 60),
      maintenance_minutes: Math.round(b.maintenanceSeconds / 60),
      effective_minutes: Math.round(b.effectiveTotalSeconds / 60),
    })),
  };

  return report;
}

export async function getPublicAvailabilityForStatusPage(
  db: DB,
  input: {
    slug: string;
    componentId?: string | null;
    fromSec?: number | null;
    toSec?: number | null;
    days: number;
    bucket: "day" | "hour";
  },
): Promise<
  | { kind: "not_found" }
  | {
      kind: "ok";
      scope: { type: AvailabilityScopeType; id: string; name: string };
      summary: ReturnType<typeof computeAvailability>["summary"];
      buckets: Array<
        ReturnType<typeof computeAvailabilityBuckets>["buckets"][number]
      >;
    }
> {
  const externalPage = await getExternalStatusPageBySlug(db, input.slug);
  if (!externalPage) return { kind: "not_found" };

  const nowSec = Math.floor(Date.now() / 1000);
  const to = input.toSec ?? nowSec;
  const from = input.fromSec ?? to - input.days * 24 * 60 * 60;
  const { from: fromClamped, to: toClamped } = clampRange(from, to);

  if (!input.componentId) {
    const scope = await resolveAvailabilityScope(db, externalPage.teamId, {
      type: "status_page",
      id: externalPage.id,
      includeDependencies: true,
    });

    const downtimeIntervals = await listIncidentIntervalsForMonitors(
      db,
      externalPage.teamId,
      scope.monitorIds,
      fromClamped,
      toClamped,
    );
    const maintenanceIntervals = await listMaintenanceIntervalsForScope(
      db,
      externalPage.teamId,
      {
        componentIds: scope.componentIds,
        monitorIds: scope.monitorIds,
        monitorGroupIds: scope.monitorGroupIds,
        fromSec: fromClamped,
        toSec: toClamped,
      },
    );

    const { summary, downtimeOutsideMaintenance, maintenance } = computeAvailability({
      fromSec: fromClamped,
      toSec: toClamped,
      downtimeIntervals,
      maintenanceIntervals,
      targetPpm: null,
    });

    const { buckets } = computeAvailabilityBuckets({
      fromSec: fromClamped,
      toSec: toClamped,
      downtimeOutsideMaintenance,
      maintenance,
      bucket: input.bucket,
      maxBuckets: 1000,
    });

    return { kind: "ok", scope: scope.scope, summary, buckets };
  }

  const comps = await listComponentsForStatusPage(db, externalPage.id);
  const allowed = comps.some((c) => c.id === input.componentId);
  if (!allowed) return { kind: "not_found" };

  const scope = await resolveAvailabilityScope(db, externalPage.teamId, {
    type: "component",
    id: input.componentId,
    includeDependencies: true,
  });

  const downtimeIntervals = await listIncidentIntervalsForMonitors(
    db,
    externalPage.teamId,
    scope.monitorIds,
    fromClamped,
    toClamped,
  );
  const maintenanceIntervals = await listMaintenanceIntervalsForScope(
    db,
    externalPage.teamId,
    {
      componentIds: scope.componentIds,
      monitorIds: scope.monitorIds,
      monitorGroupIds: scope.monitorGroupIds,
      fromSec: fromClamped,
      toSec: toClamped,
    },
  );

  const { summary, downtimeOutsideMaintenance, maintenance } = computeAvailability({
    fromSec: fromClamped,
    toSec: toClamped,
    downtimeIntervals,
    maintenanceIntervals,
    targetPpm: null,
  });

  const { buckets } = computeAvailabilityBuckets({
    fromSec: fromClamped,
    toSec: toClamped,
    downtimeOutsideMaintenance,
    maintenance,
    bucket: input.bucket,
    maxBuckets: 1000,
  });

  return { kind: "ok", scope: scope.scope, summary, buckets };
}
