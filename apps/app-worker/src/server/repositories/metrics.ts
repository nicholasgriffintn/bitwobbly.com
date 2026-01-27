import type { UptimeMetrics, ComponentMetrics } from "@bitwobbly/shared";

export type MetricsRow = {
  monitor_id: string;
  latency_ms: number;
  timestamp: number;
  up_count: number;
  down_count: number;
};

export type MetricsSummary = {
  uptime_percentage: number;
  total_checks: number;
  period_hours: number;
  start_time: string;
  end_time: string;
};

export type MetricsResult = {
  metrics: Array<{
    timestamp: string;
    latency_ms: number;
    up_count: number;
    down_count: number;
    uptime_percentage: number;
  }>;
  summary: MetricsSummary;
};

export async function getMonitorMetrics(
  accountId: string,
  apiToken: string,
  monitorId: string,
  hours: number,
): Promise<MetricsResult> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

  const sanitizedMonitorId = monitorId.replace(/'/g, "''");
  const startTimestamp = Math.floor(startTime.getTime() / 1000);
  const endTimestamp = Math.floor(endTime.getTime() / 1000);
  const bucketSize =
    hours <= 1
      ? 60
      : hours <= 6
        ? 300
        : hours <= 72
          ? 1800
          : 3600;

  const query = `
    SELECT
      blob2 as monitor_id,
      blob3 as status,
      double1 as latency_ms,
      timestamp
    FROM "bitwobbly-monitor-analytics"
    WHERE blob2 = '${sanitizedMonitorId}'
      AND timestamp >= toDateTime(${startTimestamp})
      AND timestamp <= toDateTime(${endTimestamp})
    ORDER BY timestamp DESC
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
    console.error(
      `Analytics Engine query failed (${response.status}):`,
      errorText,
    );
    console.error("Query was:", query);
    throw new Error(`Analytics Engine query failed: ${errorText}`);
  }

  const responseJSON = (await response.json()) as {
    data?: Array<{
      monitor_id: string;
      status: string;
      latency_ms: number;
      timestamp: number | string;
    }>;
  };
  const rawData = responseJSON.data || [];

  const buckets = new Map<
    number,
    { latencies: number[]; up_count: number; down_count: number }
  >();

  for (const row of rawData) {
    const ts =
      typeof row.timestamp === "string"
        ? new Date(row.timestamp).getTime() / 1000
        : row.timestamp;
    const bucketTs = Math.floor(ts / bucketSize) * bucketSize;
    if (!buckets.has(bucketTs)) {
      buckets.set(bucketTs, { latencies: [], up_count: 0, down_count: 0 });
    }
    const bucket = buckets.get(bucketTs)!;
    bucket.latencies.push(row.latency_ms);
    if (row.status === "up") {
      bucket.up_count++;
    } else if (row.status === "down") {
      bucket.down_count++;
    }
  }

  const metrics = Array.from(buckets.entries())
    .map(([timestamp, bucket]) => {
      const avgLatency =
        bucket.latencies.length > 0
          ? bucket.latencies.reduce((a, b) => a + b, 0) /
            bucket.latencies.length
          : 0;
      const total = bucket.up_count + bucket.down_count;
      return {
        timestamp: new Date(timestamp * 1000).toISOString(),
        latency_ms: avgLatency,
        up_count: bucket.up_count,
        down_count: bucket.down_count,
        uptime_percentage: total > 0 ? (bucket.up_count / total) * 100 : 100,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  const totalChecks = rawData.length;
  const totalUp = rawData.filter((r) => r.status === "up").length;
  const uptimePercentage =
    totalChecks > 0 ? (totalUp / totalChecks) * 100 : 100;

  return {
    metrics,
    summary: {
      uptime_percentage: uptimePercentage,
      total_checks: totalChecks,
      period_hours: hours,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    },
  };
}

export async function getComponentUptimeMetrics(
  accountId: string,
  apiToken: string,
  monitorIds: string[],
  periodDays: number,
): Promise<UptimeMetrics> {
  if (monitorIds.length === 0) {
    return {
      period: `${periodDays}d`,
      uptimePercentage: 100,
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      incidents: 0,
      totalDowntimeMinutes: 0,
      averageLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
    };
  }

  const endTime = new Date();
  const startTime = new Date(
    endTime.getTime() - periodDays * 24 * 60 * 60 * 1000,
  );
  const startTimestamp = Math.floor(startTime.getTime() / 1000);
  const endTimestamp = Math.floor(endTime.getTime() / 1000);

  const monitorIdsClause = monitorIds
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(", ");

  const query = `
    SELECT
      blob3 as status,
      double1 as latency_ms,
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
    console.error(
      `Analytics Engine query failed (${response.status}):`,
      errorText,
    );
    throw new Error(`Analytics Engine query failed: ${errorText}`);
  }

  const responseJSON = (await response.json()) as {
    data?: Array<{
      status: string;
      latency_ms: number;
      timestamp: number | string;
    }>;
  };
  const rawData = responseJSON.data || [];

  const orderedRawData = rawData
    .map((r) => {
      const ts =
        typeof r.timestamp === "string"
          ? new Date(r.timestamp).getTime() / 1000
          : r.timestamp;
      return { ...r, timestamp: ts };
    })
    .sort((a, b) => (a.timestamp as number) - (b.timestamp as number));

  const totalChecks = orderedRawData.length;
  const upChecks = orderedRawData.filter((r) => r.status === "up");
  const downChecks = orderedRawData.filter((r) => r.status === "down");
  const successfulChecks = upChecks.length;
  const failedChecks = downChecks.length;
  const uptimePercentage =
    totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100;
  const latencies = orderedRawData
    .map((r) => r.latency_ms)
    .sort((a, b) => a - b);
  const averageLatencyMs =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
  const p95LatencyMs =
    latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const p99LatencyMs =
    latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
  let incidents = 0;
  let totalDowntimeMinutes = 0;
  let inIncident = false;
  let incidentStartTime: number | null = null;

  for (let i = 0; i < orderedRawData.length; i++) {
    const check = orderedRawData[i];
    const ts = check.timestamp as number;

    if (check.status === "down" && !inIncident) {
      incidents++;
      inIncident = true;
      incidentStartTime = ts;
    } else if (check.status === "up" && inIncident) {
      if (incidentStartTime !== null) {
        totalDowntimeMinutes += (ts - incidentStartTime) / 60;
      }
      inIncident = false;
      incidentStartTime = null;
    }
  }
  if (inIncident && incidentStartTime !== null) {
    totalDowntimeMinutes += (endTimestamp - incidentStartTime) / 60;
  }

  return {
    period: `${periodDays}d`,
    uptimePercentage,
    totalChecks,
    successfulChecks,
    failedChecks,
    incidents,
    totalDowntimeMinutes: Math.round(totalDowntimeMinutes),
    averageLatencyMs: Math.round(averageLatencyMs),
    p95LatencyMs: Math.round(p95LatencyMs),
    p99LatencyMs: Math.round(p99LatencyMs),
  };
}

export async function getComponentMetrics(
  accountId: string,
  apiToken: string,
  componentId: string,
  componentName: string,
  monitorIds: string[],
  fromTimestamp: number,
  toTimestamp: number,
): Promise<ComponentMetrics> {
  if (monitorIds.length === 0) {
    const periodDays = Math.ceil(
      (toTimestamp - fromTimestamp) / (24 * 60 * 60 * 1000),
    );
    return {
      componentId,
      componentName,
      uptime: {
        period: `${periodDays}d`,
        uptimePercentage: 100,
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        incidents: 0,
        totalDowntimeMinutes: 0,
        averageLatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
      },
      dataPoints: [],
    };
  }

  const periodDays = Math.ceil(
    (toTimestamp - fromTimestamp) / (24 * 60 * 60 * 1000),
  );
  const uptime = await getComponentUptimeMetrics(
    accountId,
    apiToken,
    monitorIds,
    periodDays,
  );

  const startTimestampSec = Math.floor(fromTimestamp / 1000);
  const endTimestampSec = Math.floor(toTimestamp / 1000);
  const monitorIdsClause = monitorIds
    .map((id) => `'${id.replace(/'/g, "''")}'`)
    .join(", ");

  const bucketSize = 3600;

  const query = `
    SELECT
      blob3 as status,
      double1 as latency_ms,
      timestamp
    FROM "bitwobbly-monitor-analytics"
    WHERE blob2 IN (${monitorIdsClause})
      AND timestamp >= toDateTime(${startTimestampSec})
      AND timestamp <= toDateTime(${endTimestampSec})
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
    throw new Error(`Analytics Engine query failed: ${errorText}`);
  }

  const responseJSON = (await response.json()) as {
    data?: Array<{
      status: string;
      latency_ms: number;
      timestamp: number | string;
    }>;
  };
  const rawData = responseJSON.data || [];

  const buckets = new Map<
    number,
    { latencies: number[]; up_count: number; down_count: number }
  >();

  for (const row of rawData) {
    const ts =
      typeof row.timestamp === "string"
        ? new Date(row.timestamp).getTime() / 1000
        : row.timestamp;
    const bucketTs = Math.floor(ts / bucketSize) * bucketSize;

    if (!buckets.has(bucketTs)) {
      buckets.set(bucketTs, { latencies: [], up_count: 0, down_count: 0 });
    }

    const bucket = buckets.get(bucketTs)!;
    bucket.latencies.push(row.latency_ms);

    if (row.status === "up") {
      bucket.up_count++;
    } else if (row.status === "down") {
      bucket.down_count++;
    }
  }

  const dataPoints = Array.from(buckets.entries())
    .map(([timestamp, bucket]) => {
      const total = bucket.up_count + bucket.down_count;
      const uptimePercentage =
        total > 0 ? (bucket.up_count / total) * 100 : 100;
      const latencyMs =
        bucket.latencies.length > 0
          ? bucket.latencies.reduce((a, b) => a + b, 0) /
            bucket.latencies.length
          : 0;

      let status: "operational" | "degraded" | "down" = "operational";
      if (uptimePercentage < 50) {
        status = "down";
      } else if (uptimePercentage < 99) {
        status = "degraded";
      }

      return {
        timestamp: new Date(timestamp * 1000).toISOString(),
        uptimePercentage,
        latencyMs: Math.round(latencyMs),
        status,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  return {
    componentId,
    componentName,
    uptime,
    dataPoints,
  };
}
