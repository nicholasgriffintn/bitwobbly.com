interface DayStatus {
  date: string;
  status: "operational" | "degraded" | "down" | "unknown";
  uptimePercentage: number;
}

interface HistoricalUptimeBarProps {
  data: DayStatus[];
  componentName: string;
  overallUptime: number;
}

export function HistoricalUptimeBar({
  data,
  componentName,
  overallUptime,
}: HistoricalUptimeBarProps) {
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

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <span style={{ fontWeight: 500, color: "#374151" }}>
          {componentName}
        </span>
        <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          {overallUptime.toFixed(2)}% uptime
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(90, 1fr)",
          gap: "2px",
          height: "34px",
          background: "#f9fafb",
          padding: "4px",
          borderRadius: "4px",
        }}
      >
        {data.map((day, idx) => (
          <div
            key={idx}
            style={{
              backgroundColor: getStatusColor(day.status),
              borderRadius: "2px",
              transition: "opacity 0.2s",
            }}
            title={`${day.date}: ${day.uptimePercentage.toFixed(2)}% uptime`}
          />
        ))}
      </div>
    </div>
  );
}
