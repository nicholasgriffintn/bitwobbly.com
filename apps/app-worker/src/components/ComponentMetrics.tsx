import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { UptimeMetrics, ComponentMetrics } from "@bitwobbly/shared";

import { UptimeChart } from "./UptimeChart";
import { LatencyChart } from "./LatencyChart";
import { UptimeHeatmap } from "./UptimeHeatmap";
import {
  getComponentUptimeFn,
  getComponentMetricsFn,
} from "@/server/functions/components";

interface ComponentMetricsProps {
  componentId: string;
  componentName: string;
}

export function ComponentMetrics({ componentId }: ComponentMetricsProps) {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [uptime, setUptime] = useState<UptimeMetrics | null>(null);
  const [metrics, setMetrics] = useState<ComponentMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getUptime = useServerFn(getComponentUptimeFn);
  const getMetrics = useServerFn(getComponentMetricsFn);

  useEffect(() => {
    loadMetrics();
  }, [componentId, period]);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const toTimestamp = Date.now();
      const fromTimestamp = toTimestamp - periodDays * 24 * 60 * 60 * 1000;

      const [uptimeData, metricsData] = await Promise.all([
        getUptime({ data: { componentId, period } }),
        getMetrics({
          data: { componentId, from: fromTimestamp, to: toTimestamp },
        }),
      ]);

      setUptime(uptimeData);
      setMetrics(metricsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const formatDowntime = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) {
      return `${hours}h ${mins}m`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  };

  return (
    <div
      style={{
        padding: "1rem",
        background: "var(--bg)",
        borderRadius: "16px",
        border: "1px solid var(--stroke)",
      }}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={period === "7d" ? "" : "outline"}
            onClick={() => setPeriod("7d")}
            style={{ padding: "0.5rem 1rem", fontSize: "0.875rem" }}
          >
            7 Days
          </button>
          <button
            className={period === "30d" ? "" : "outline"}
            onClick={() => setPeriod("30d")}
            style={{ padding: "0.5rem 1rem", fontSize: "0.875rem" }}
          >
            30 Days
          </button>
          <button
            className={period === "90d" ? "" : "outline"}
            onClick={() => setPeriod("90d")}
            style={{ padding: "0.5rem 1rem", fontSize: "0.875rem" }}
          >
            90 Days
          </button>
        </div>
      </div>

      {loading && <div>Loading metrics...</div>}
      {error && <div className="card error">{error}</div>}

      {uptime && !loading && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div className="card">
              <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                Uptime
              </div>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: "600",
                  color:
                    uptime.uptimePercentage >= 99.9 ? "#10b981" : "#f59e0b",
                }}
              >
                {uptime.uptimePercentage.toFixed(2)}%
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                {uptime.totalChecks} checks
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                Avg Latency
              </div>
              <div style={{ fontSize: "2rem", fontWeight: "600" }}>
                {uptime.averageLatencyMs}ms
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                P95: {uptime.p95LatencyMs}ms | P99: {uptime.p99LatencyMs}ms
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                Incidents
              </div>
              <div style={{ fontSize: "2rem", fontWeight: "600" }}>
                {uptime.incidents}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                {formatDowntime(uptime.totalDowntimeMinutes)} downtime
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                Success Rate
              </div>
              <div style={{ fontSize: "2rem", fontWeight: "600" }}>
                {uptime.totalChecks > 0
                  ? (
                      (uptime.successfulChecks / uptime.totalChecks) *
                      100
                    ).toFixed(1)
                  : "0"}
                %
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                {uptime.successfulChecks} / {uptime.totalChecks}
              </div>
            </div>
          </div>

          {metrics && metrics.dataPoints.length > 0 && (
            <>
              <div className="card" style={{ marginBottom: "1rem" }}>
                <div className="card-title" style={{ marginBottom: "1rem" }}>
                  Uptime Timeline
                </div>
                <UptimeChart data={metrics.dataPoints} />
              </div>

              <div className="card" style={{ marginBottom: "1rem" }}>
                <div className="card-title" style={{ marginBottom: "1rem" }}>
                  Latency Trends
                </div>
                <LatencyChart data={metrics.dataPoints} />
              </div>

              <div className="card">
                <div className="card-title" style={{ marginBottom: "1rem" }}>
                  Availability Heatmap
                </div>
                <UptimeHeatmap data={metrics.dataPoints} />
              </div>
            </>
          )}

          {(!metrics || metrics.dataPoints.length === 0) && (
            <div className="card">
              <div style={{ textAlign: "center", color: "#6b7280" }}>
                No data available for the selected period
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
