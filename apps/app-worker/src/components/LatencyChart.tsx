import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { MetricDataPoint } from "@bitwobbly/shared";

interface LatencyChartProps {
  data: MetricDataPoint[];
}

export function LatencyChart({ data }: LatencyChartProps) {
  const chartData = data.map((point) => ({
    time: new Date(point.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
    }),
    latency: point.latencyMs,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="time" stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "0.375rem",
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="latency"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          name="Latency (ms)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
