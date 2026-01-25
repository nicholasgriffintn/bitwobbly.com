import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface SDKDistributionChartProps {
  data: Array<{
    sdk_name: string;
    event_count: number;
    percentage: number;
  }>;
}

const COLORS = [
  "#f97316",
  "#a855f7",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#ec4899",
];

export function SDKDistributionChart({ data }: SDKDistributionChartProps) {
  const chartData = data.map((item) => ({
    name: item.sdk_name,
    events: item.event_count,
    percentage: item.percentage.toFixed(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" stroke="#6b7280" fontSize={12} />
        <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "0.375rem",
          }}
          formatter={(
            value: number | undefined,
            _name: string | undefined,
            props: any,
          ) => {
            if (value === undefined) return ["", ""];
            return [
              `${value.toLocaleString()} events (${props.payload.percentage}%)`,
              "Count",
            ];
          }}
        />
        <Bar dataKey="events" radius={[0, 4, 4, 0]}>
          {chartData.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
