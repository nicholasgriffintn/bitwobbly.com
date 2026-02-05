import { createLogger } from "@bitwobbly/shared";

import { isRecord } from "./type-guards.ts";

const logger = createLogger({ service: "status-history-repository" });

export type DayStatus = {
  date: string;
  status: "operational" | "degraded" | "down" | "unknown";
  uptimePercentage: number;
};

export type DayBucketCounts = { upCount: number; downCount: number };

export function buildEmptyHistory(days: number, fill: DayStatus["status"]) {
  const result: DayStatus[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    result.push({
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      status: fill,
      uptimePercentage: fill === "unknown" ? 0 : 100,
    });
  }
  return result;
}

export function computeHistoryFromBuckets(
  dayBuckets: Map<string, DayBucketCounts>,
  days: number
): DayStatus[] {
  const result: DayStatus[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayKey = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    const bucket = dayBuckets.get(dayKey);
    if (bucket) {
      const total = bucket.upCount + bucket.downCount;
      const uptimePercentage = total > 0 ? (bucket.upCount / total) * 100 : 100;
      let status: "operational" | "degraded" | "down" = "operational";
      if (uptimePercentage < 50) {
        status = "down";
      } else if (uptimePercentage < 99) {
        status = "degraded";
      }
      result.push({
        date: dayKey,
        status,
        uptimePercentage,
      });
    } else {
      result.push({
        date: dayKey,
        status: "unknown",
        uptimePercentage: 100,
      });
    }
  }
  return result;
}

export async function getHistoricalBucketsForMonitors(
  accountId: string,
  apiToken: string,
  monitorIds: string[],
  days: number
): Promise<Map<string, Map<string, DayBucketCounts>> | null> {
  if (monitorIds.length === 0) return new Map();

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
  const startTimestamp = Math.floor(startTime.getTime() / 1000);
  const endTimestamp = Math.floor(endTime.getTime() / 1000);

  const monitorIdsClause = monitorIds
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(", ");

  const query = `
    SELECT
      blob2 as monitorId,
      blob3 as status,
      timestamp
    FROM "bitwobbly-monitor-analytics"
    WHERE blob2 IN (${monitorIdsClause})
      AND timestamp >= toDateTime(${startTimestamp})
      AND timestamp <= toDateTime(${endTimestamp})
    ORDER BY timestamp ASC
  `;

  const API = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;
  const response = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: query,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`Analytics Engine query failed (${response.status}):`, {
      errorText,
    });
    return null;
  }

  const responseJSON: unknown = await response.json();
  const rawData: Array<{
    monitorId: string;
    status: string;
    timestamp: number | string;
  }> = [];

  if (isRecord(responseJSON) && Array.isArray(responseJSON.data)) {
    for (const row of responseJSON.data) {
      if (!isRecord(row)) continue;
      const monitorId = typeof row.monitorId === "string" ? row.monitorId : null;
      const status = typeof row.status === "string" ? row.status : null;
      const timestamp =
        typeof row.timestamp === "number" || typeof row.timestamp === "string"
          ? row.timestamp
          : null;

      if (monitorId && status && timestamp !== null) {
        rawData.push({ monitorId, status, timestamp });
      }
    }
  }

  const byMonitor = new Map<string, Map<string, DayBucketCounts>>();

  for (const row of rawData) {
    const ts =
      typeof row.timestamp === "string"
        ? new Date(row.timestamp).getTime()
        : row.timestamp * 1000;
    const date = new Date(ts);
    const dayKey = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    let dayBuckets = byMonitor.get(row.monitorId);
    if (!dayBuckets) {
      dayBuckets = new Map();
      byMonitor.set(row.monitorId, dayBuckets);
    }

    let bucket = dayBuckets.get(dayKey);
    if (!bucket) {
      bucket = { upCount: 0, downCount: 0 };
      dayBuckets.set(dayKey, bucket);
    }

    if (row.status === "up") {
      bucket.upCount++;
    } else if (row.status === "down") {
      bucket.downCount++;
    }
  }

  return byMonitor;
}

export async function getComponentHistoricalData(
  accountId: string,
  apiToken: string,
  monitorIds: string[],
  days: number
): Promise<DayStatus[]> {
  if (monitorIds.length === 0) {
    return buildEmptyHistory(days, "operational");
  }

  const byMonitor = await getHistoricalBucketsForMonitors(
    accountId,
    apiToken,
    monitorIds,
    days
  );
  if (!byMonitor) return buildEmptyHistory(days, "unknown");

  const combined = new Map<string, DayBucketCounts>();
  for (const monitorId of monitorIds) {
    const buckets = byMonitor.get(monitorId);
    if (!buckets) continue;
    for (const [dayKey, counts] of buckets.entries()) {
      const existing = combined.get(dayKey) || { upCount: 0, downCount: 0 };
      existing.upCount += counts.upCount;
      existing.downCount += counts.downCount;
      combined.set(dayKey, existing);
    }
  }

  return computeHistoryFromBuckets(combined, days);
}
