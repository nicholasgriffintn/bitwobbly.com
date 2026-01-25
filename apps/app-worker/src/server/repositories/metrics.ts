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

  const query = `
    SELECT
      blob1 as monitor_id,
      double1 as latency_ms,
      double2 as timestamp,
      SUM(CASE WHEN blob2 = 'up' THEN 1 ELSE 0 END) as up_count,
      SUM(CASE WHEN blob2 = 'down' THEN 1 ELSE 0 END) as down_count
    FROM analytics_dataset
    WHERE blob1 = '${monitorId}'
      AND double2 >= ${startTime.getTime() / 1000}
      AND double2 <= ${endTime.getTime() / 1000}
    GROUP BY
      FLOOR(double2 / (${hours * 60})) * (${hours * 60})
    ORDER BY double2 DESC
    LIMIT ${hours}
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

  const responseJSON = (await response.json()) as { data?: MetricsRow[] };
  const metrics = responseJSON.data || [];

  const totalChecks = metrics.reduce(
    (sum: number, row: Record<string, unknown>) => {
      return sum + Number(row.up_count) + Number(row.down_count);
    },
    0,
  );
  const totalUp = metrics.reduce(
    (sum: number, row: Record<string, unknown>) => {
      return sum + Number(row.up_count);
    },
    0,
  );
  const uptimePercentage =
    totalChecks > 0 ? (totalUp / totalChecks) * 100 : 100;

  return {
    metrics: metrics.map((row: Record<string, unknown>) => ({
      timestamp: new Date(Number(row.timestamp) * 1000).toISOString(),
      latency_ms: Number(row.latency_ms),
      up_count: Number(row.up_count),
      down_count: Number(row.down_count),
      uptime_percentage:
        (Number(row.up_count) /
          (Number(row.up_count) + Number(row.down_count))) *
        100,
    })),
    summary: {
      uptime_percentage: uptimePercentage,
      total_checks: totalChecks,
      period_hours: hours,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    },
  };
}
