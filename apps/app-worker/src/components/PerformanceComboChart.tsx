import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricDataPoint } from "@bitwobbly/shared";

interface PerformanceComboChartProps {
  data: MetricDataPoint[];
}

export function PerformanceComboChart({ data }: PerformanceComboChartProps) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        time: new Date(point.timestamp).toLocaleDateString("en-GB", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
        }),
        latency: Math.round(point.latencyMs),
        uptime: Number(point.uptimePercentage.toFixed(2)),
      })),
    [data]
  );

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgba(111,98,85,0.2)" strokeDasharray="3 3" />
        <XAxis dataKey="time" stroke="var(--muted)" fontSize={12} />
        <YAxis
          yAxisId="uptime"
          domain={[0, 100]}
          stroke="var(--success)"
          fontSize={12}
          tickFormatter={(value: number) => `${value}%`}
        />
        <YAxis
          yAxisId="latency"
          orientation="right"
          stroke="#1e40af"
          fontSize={12}
          tickFormatter={(value: number) => `${value}ms`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--stroke)",
            borderRadius: "12px",
            boxShadow: "var(--shadow)",
          }}
        />
        <Area
          yAxisId="uptime"
          type="monotone"
          dataKey="uptime"
          name="Uptime"
          stroke="var(--success)"
          fill="rgba(26,143,95,0.14)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="latency"
          type="monotone"
          dataKey="latency"
          name="Latency"
          stroke="#1e40af"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
