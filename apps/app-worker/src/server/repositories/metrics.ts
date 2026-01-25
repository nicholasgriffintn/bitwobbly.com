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
  const bucketSize = hours * 60;

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
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, hours);

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
