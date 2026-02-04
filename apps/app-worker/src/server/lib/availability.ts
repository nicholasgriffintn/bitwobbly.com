import {
  clampIntervals,
  mergeIntervals,
  subtractIntervals,
  sumIntervalSeconds,
  sumOverlapSeconds,
  type Interval,
} from "@bitwobbly/shared";

export type AvailabilityBucket = {
  start: number;
  end: number;
  uptimePercent: number;
  uptimePpm: number;
  downtimeSeconds: number;
  maintenanceSeconds: number;
  effectiveTotalSeconds: number;
};

export type AvailabilitySummary = {
  fromSec: number;
  toSec: number;
  totalSeconds: number;
  maintenanceSeconds: number;
  effectiveTotalSeconds: number;
  downtimeSeconds: number;
  uptimePpm: number;
  uptimePercent: number;
  errorBudget?: {
    targetPpm: number;
    targetPercent: number;
    allowedDowntimeSeconds: number;
    burnedDowntimeSeconds: number;
    remainingDowntimeSeconds: number;
  };
};

export function percentToPpm(percent: number): number {
  const ppm = Math.round((percent / 100) * 1_000_000);
  return Math.max(0, Math.min(1_000_000, ppm));
}

export function ppmToPercent(ppm: number): number {
  return (ppm / 1_000_000) * 100;
}

function nextUtcBoundarySec(cursorSec: number, bucket: "hour" | "day"): number {
  const d = new Date(cursorSec * 1000);
  if (bucket === "hour") {
    d.setUTCMinutes(0, 0, 0);
    d.setUTCHours(d.getUTCHours() + 1);
    return Math.floor(d.getTime() / 1000);
  }
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return Math.floor(d.getTime() / 1000);
}

function intervalCountOverlaps(intervals: Interval[], range: Interval): number {
  let count = 0;
  for (const i of intervals) {
    if (i.end <= range.start) continue;
    if (i.start >= range.end) break;
    if (i.start < range.end && i.end > range.start) count++;
  }
  return count;
}

export function computeAvailability(input: {
  fromSec: number;
  toSec: number;
  downtimeIntervals: Interval[];
  maintenanceIntervals?: Interval[];
  targetPpm?: number | null;
}): {
  summary: AvailabilitySummary;
  downtimeOutsideMaintenance: Interval[];
  maintenance: Interval[];
} {
  const fromSec = Math.floor(input.fromSec);
  const toSec = Math.floor(input.toSec);
  if (
    !Number.isFinite(fromSec) ||
    !Number.isFinite(toSec) ||
    toSec <= fromSec
  ) {
    throw new Error("Invalid range");
  }

  const range: Interval = { start: fromSec, end: toSec };

  const maintenance = mergeIntervals(
    clampIntervals(input.maintenanceIntervals ?? [], range)
  );
  const downtime = mergeIntervals(
    clampIntervals(input.downtimeIntervals, range)
  );
  const downtimeOutsideMaintenance = subtractIntervals(downtime, maintenance);

  const totalSeconds = toSec - fromSec;
  const maintenanceSeconds = sumIntervalSeconds(maintenance);
  const effectiveTotalSeconds = Math.max(0, totalSeconds - maintenanceSeconds);
  const downtimeSeconds = sumIntervalSeconds(downtimeOutsideMaintenance);

  const uptimePpm =
    effectiveTotalSeconds > 0
      ? Math.max(
          0,
          Math.min(
            1_000_000,
            Math.round(
              ((effectiveTotalSeconds - downtimeSeconds) /
                effectiveTotalSeconds) *
                1_000_000
            )
          )
        )
      : 1_000_000;

  const summary: AvailabilitySummary = {
    fromSec,
    toSec,
    totalSeconds,
    maintenanceSeconds,
    effectiveTotalSeconds,
    downtimeSeconds,
    uptimePpm,
    uptimePercent: ppmToPercent(uptimePpm),
  };

  const targetPpm = input.targetPpm ?? null;
  if (targetPpm !== null && Number.isFinite(targetPpm)) {
    const clampedTarget = Math.max(
      0,
      Math.min(1_000_000, Math.floor(targetPpm))
    );
    const allowedDowntimeSeconds = Math.max(
      0,
      Math.floor(effectiveTotalSeconds * (1 - clampedTarget / 1_000_000))
    );
    const burnedDowntimeSeconds = downtimeSeconds;
    const remainingDowntimeSeconds =
      allowedDowntimeSeconds - burnedDowntimeSeconds;
    summary.errorBudget = {
      targetPpm: clampedTarget,
      targetPercent: ppmToPercent(clampedTarget),
      allowedDowntimeSeconds,
      burnedDowntimeSeconds,
      remainingDowntimeSeconds,
    };
  }

  return { summary, downtimeOutsideMaintenance, maintenance };
}

export function computeAvailabilityBuckets(input: {
  fromSec: number;
  toSec: number;
  downtimeOutsideMaintenance: Interval[];
  maintenance: Interval[];
  bucket: "hour" | "day";
  maxBuckets?: number;
}): { buckets: AvailabilityBucket[]; incidentBuckets: number[] } {
  const fromSec = Math.floor(input.fromSec);
  const toSec = Math.floor(input.toSec);
  const maxBuckets = input.maxBuckets ?? 1000;
  if (toSec <= fromSec) return { buckets: [], incidentBuckets: [] };

  const buckets: AvailabilityBucket[] = [];
  const incidentBuckets: number[] = [];

  let cursor = fromSec;
  while (cursor < toSec) {
    if (buckets.length >= maxBuckets) {
      throw new Error("Too many buckets requested");
    }
    const boundary = nextUtcBoundarySec(cursor, input.bucket);
    const end = Math.min(toSec, Math.max(cursor + 1, boundary));
    const range: Interval = { start: cursor, end };
    const totalSeconds = end - cursor;

    const maintenanceSeconds = sumOverlapSeconds(input.maintenance, range);
    const effectiveTotalSeconds = Math.max(
      0,
      totalSeconds - maintenanceSeconds
    );
    const downtimeSeconds = sumOverlapSeconds(
      input.downtimeOutsideMaintenance,
      range
    );

    const uptimePpm =
      effectiveTotalSeconds > 0
        ? Math.max(
            0,
            Math.min(
              1_000_000,
              Math.round(
                ((effectiveTotalSeconds - downtimeSeconds) /
                  effectiveTotalSeconds) *
                  1_000_000
              )
            )
          )
        : 1_000_000;

    buckets.push({
      start: cursor,
      end,
      uptimePercent: ppmToPercent(uptimePpm),
      uptimePpm,
      downtimeSeconds,
      maintenanceSeconds,
      effectiveTotalSeconds,
    });

    incidentBuckets.push(
      intervalCountOverlaps(input.downtimeOutsideMaintenance, range)
    );

    cursor = end;
  }

  return { buckets, incidentBuckets };
}

export function utcMonthRange(month: string): {
  fromSec: number;
  toSec: number;
} {
  const m = month.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(m);
  if (!match) throw new Error("Invalid month format (expected YYYY-MM)");
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(mon) || mon < 1 || mon > 12) {
    throw new Error("Invalid month");
  }
  const from = Date.UTC(year, mon - 1, 1, 0, 0, 0, 0);
  const to = Date.UTC(year, mon, 1, 0, 0, 0, 0);
  return { fromSec: Math.floor(from / 1000), toSec: Math.floor(to / 1000) };
}

export const DEFAULT_TEAM_SLO_TARGET_PPM = 999_000; // 99.9%
