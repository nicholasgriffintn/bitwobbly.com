import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface EventVolumeChartProps {
  data: Array<{
    timestamp: string;
    accepted: number;
    filtered: number;
    dropped: number;
  }>;
}

export function EventVolumeChart({ data }: EventVolumeChartProps) {
  const chartData = data.map((point) => ({
    time: new Date(point.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
    }),
    Accepted: point.accepted,
    Filtered: point.filtered,
    Dropped: point.dropped,
  }));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={chartData}>
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
        <Area
          type="monotone"
          dataKey="Accepted"
          stackId="1"
          stroke="#f97316"
          fill="#f97316"
          fillOpacity={0.6}
        />
        <Area
          type="monotone"
          dataKey="Filtered"
          stackId="1"
          stroke="#a855f7"
          fill="#a855f7"
          fillOpacity={0.6}
        />
        <Area
          type="monotone"
          dataKey="Dropped"
          stackId="1"
          stroke="#ef4444"
          fill="#ef4444"
          fillOpacity={0.6}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
