export interface UptimeMetrics {
  period: string;
  uptimePercentage: number;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  incidents: number;
  totalDowntimeMinutes: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface MetricDataPoint {
  timestamp: string;
  uptimePercentage: number;
  latencyMs: number;
  status: "operational" | "degraded" | "down";
}

export interface ComponentMetrics {
  componentId: string;
  componentName: string;
  uptime: UptimeMetrics;
  dataPoints: MetricDataPoint[];
}
