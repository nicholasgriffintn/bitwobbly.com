interface EventMetricsProps {
  stats: {
    total_events: number;
    accepted_events: number;
    filtered_events: number;
    dropped_events: number;
  };
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

export function EventMetrics({ stats }: EventMetricsProps) {
  return (
    <div className="grid metrics mb-1.5">
      <div className="card">
        <div className="metric-label">Total Events</div>
        <div className="metric-value">{formatNumber(stats.total_events)}</div>
      </div>
      <div className="card">
        <div className="metric-label">
          Accepted{" "}
          <span className="muted" style={{ fontSize: "0.75rem" }}>
            ⓘ
          </span>
        </div>
        <div className="metric-value" style={{ color: "#f97316" }}>
          {formatNumber(stats.accepted_events)}
        </div>
      </div>
      <div className="card">
        <div className="metric-label">
          Filtered{" "}
          <span className="muted" style={{ fontSize: "0.75rem" }}>
            ⓘ
          </span>
        </div>
        <div className="metric-value" style={{ color: "#a855f7" }}>
          {formatNumber(stats.filtered_events)}
        </div>
      </div>
      <div className="card">
        <div className="metric-label">
          Dropped{" "}
          <span className="muted" style={{ fontSize: "0.75rem" }}>
            ⓘ
          </span>
        </div>
        <div className="metric-value" style={{ color: "#ef4444" }}>
          {formatNumber(stats.dropped_events)}
        </div>
      </div>
    </div>
  );
}
