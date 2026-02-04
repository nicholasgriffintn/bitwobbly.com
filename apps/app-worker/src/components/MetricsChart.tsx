import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMonitorMetricsFn } from "@/server/functions/monitors";
import { UptimeChart } from "@/components/UptimeChart";
import { LatencyChart } from "@/components/LatencyChart";
import type { MetricDataPoint } from "@bitwobbly/shared";

type MetricsData = {
  timestamp: string;
  latency_ms: number;
  up_count: number;
  down_count: number;
  uptime_percentage: number;
}[];

type MetricsResponse = {
  metrics: MetricsData;
  summary: {
    uptime_percentage: number;
    total_checks: number;
    period_hours: number;
    start_time: string;
    end_time: string;
  };
};

interface MetricsChartProps {
  monitorId: string;
}

function transformToDataPoints(metrics: MetricsData): MetricDataPoint[] {
  return metrics.map((m) => ({
    timestamp: m.timestamp,
    uptimePercentage: m.uptime_percentage,
    latencyMs: m.latency_ms,
    status: (m.up_count > 0 ? "operational" : "down") as
      | "operational"
      | "degraded"
      | "down",
  }));
}

export function MetricsChart({ monitorId }: MetricsChartProps) {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState("24");

  const getMetrics = useServerFn(getMonitorMetricsFn);

  useEffect(() => {
    if (!monitorId) return;

    let cancelled = false;
    async function loadMetrics() {
      setLoading(true);
      setError(null);
      try {
        const metricsData = await getMetrics({
          data: { monitorId, hours: Number(hours) },
        });

        if (!cancelled) {
          setData(metricsData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load metrics"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [monitorId, hours]);

  return (
    <div className="card">
      <div className="card-title">Historical Performance</div>

      <div className="form mb-4">
        <label htmlFor="hours-range">Time Range</label>
        <select
          id="hours-range"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-auto inline-block"
        >
          <option value="1">Last 1 hour</option>
          <option value="6">Last 6 hours</option>
          <option value="24">Last 24 hours</option>
          <option value="72">Last 3 days</option>
          <option value="168">Last 7 days</option>
        </select>
      </div>

      {loading && <div>Loading metrics...</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <div>
          <div className="grid three mb-4">
            <div className="text-center">
              <div
                className="font-bold text-2xl"
                style={{
                  color:
                    data.summary.uptime_percentage >= 99
                      ? "#28a745"
                      : data.summary.uptime_percentage >= 95
                        ? "#ffc107"
                        : "#dc3545",
                }}
              >
                {data.summary.uptime_percentage.toFixed(2)}%
              </div>
              <div className="muted">Uptime</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                {data.metrics.length > 0
                  ? `${(data.metrics.reduce((sum, m) => sum + m.latency_ms, 0) / data.metrics.length).toFixed(0)}ms`
                  : "0ms"}
              </div>
              <div className="muted">Avg Latency</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                {data.summary.total_checks}
              </div>
              <div className="muted">Total Checks</div>
            </div>
          </div>

          {data.metrics.length > 0 && (
            <>
              <div style={{ marginTop: "1rem" }}>
                <h4 style={{ marginBottom: "0.5rem" }}>Uptime Trend</h4>
                <UptimeChart data={transformToDataPoints(data.metrics)} />
              </div>

              <div style={{ marginTop: "2rem" }}>
                <h4 style={{ marginBottom: "0.5rem" }}>Response Time Trend</h4>
                <LatencyChart data={transformToDataPoints(data.metrics)} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
