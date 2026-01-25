import type { MetricDataPoint } from "@bitwobbly/shared";

interface UptimeHeatmapProps {
  data: MetricDataPoint[];
}

export function UptimeHeatmap({ data }: UptimeHeatmapProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "operational":
        return "#10b981";
      case "degraded":
        return "#f59e0b";
      case "down":
        return "#ef4444";
      default:
        return "#d1d5db";
    }
  };

  const groupedByDay = data.reduce(
    (acc, point) => {
      const date = new Date(point.timestamp).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(point);
      return acc;
    },
    {} as Record<string, MetricDataPoint[]>,
  );

  const dailyStatuses = Object.entries(groupedByDay).map(([date, points]) => {
    const avgUptime =
      points.reduce((sum, p) => sum + p.uptimePercentage, 0) / points.length;
    let status: "operational" | "degraded" | "down" = "operational";
    if (avgUptime < 50) {
      status = "down";
    } else if (avgUptime < 99) {
      status = "degraded";
    }
    return { date, status, uptime: avgUptime };
  });

  return (
    <div className="uptime-heatmap">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(12px, 1fr))",
          gap: "4px",
          maxWidth: "100%",
        }}
      >
        {dailyStatuses.map((day, idx) => (
          <div
            key={idx}
            style={{
              width: "12px",
              height: "12px",
              backgroundColor: getStatusColor(day.status),
              borderRadius: "2px",
            }}
            title={`${day.date}: ${day.uptime.toFixed(2)}% uptime`}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginTop: "16px",
          fontSize: "12px",
          color: "#6b7280",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              backgroundColor: "#10b981",
              borderRadius: "2px",
            }}
          />
          <span>Operational</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              backgroundColor: "#f59e0b",
              borderRadius: "2px",
            }}
          />
          <span>Degraded</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div
            style={{
              width: "12px",
              height: "12px",
              backgroundColor: "#ef4444",
              borderRadius: "2px",
            }}
          />
          <span>Down</span>
        </div>
      </div>
    </div>
  );
}
