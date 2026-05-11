export type MonitorVisualInput = {
  type: string;
  enabled?: number | boolean | null;
  groupId?: string | null;
  intervalSeconds?: number | null;
  timeoutMs?: number | null;
  failureThreshold?: number | null;
  state?: {
    lastStatus?: string | null;
    lastLatencyMs?: number | null;
  } | null;
};

export type ComponentVisualInput = {
  id: string;
  name: string;
  monitorIds: string[];
  dependencyIds: string[];
  currentStatus?: string | null;
};

export type MonitorVisualStatus = "up" | "down" | "degraded" | "unknown" | "paused";
export type ComponentVisualStatus =
  | "operational"
  | "degraded"
  | "down"
  | "maintenance"
  | "unknown";

export type StatusCount<TStatus extends string> = {
  status: TStatus;
  count: number;
  percent: number;
};

export type PieSegment<TStatus extends string> = StatusCount<TStatus> & {
  path: string;
};

const MONITOR_STATUS_ORDER: MonitorVisualStatus[] = [
  "up",
  "down",
  "degraded",
  "unknown",
  "paused",
];

const COMPONENT_STATUS_ORDER: ComponentVisualStatus[] = [
  "operational",
  "degraded",
  "down",
  "maintenance",
  "unknown",
];

function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return (count / total) * 100;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatLatencyMs(value: number | null): string {
  return value === null ? "No latency" : `${value}ms`;
}

export function buildConicGradient<TStatus extends string>(
  counts: StatusCount<TStatus>[],
  statusColors: Record<string, string>,
  emptyColor: string
): string {
  if (!counts.some((count) => count.count > 0)) return emptyColor;

  let start = 0;
  return counts
    .filter((count) => count.count > 0)
    .map((count) => {
      const end = start + count.percent;
      const color = statusColors[count.status] || statusColors.unknown || emptyColor;
      const segment = `${color} ${start}% ${end}%`;
      start = end;
      return segment;
    })
    .join(", ");
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function buildDonutPath(
  startAngle: number,
  endAngle: number,
  outerRadius: number,
  innerRadius: number,
  center: number
): string {
  const outerStart = polarPoint(center, center, outerRadius, startAngle);
  const outerEnd = polarPoint(center, center, outerRadius, endAngle);
  const innerStart = polarPoint(center, center, innerRadius, startAngle);
  const innerEnd = polarPoint(center, center, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

export function buildPieSegments<TStatus extends string>(
  counts: StatusCount<TStatus>[],
  options: { outerRadius: number; innerRadius: number; center: number }
): PieSegment<TStatus>[] {
  const visibleCounts = counts.filter((count) => count.count > 0);
  let startAngle = 0;

  return visibleCounts.map((count, index) => {
    const isFullCircle = visibleCounts.length === 1 && count.percent >= 100;
    const segmentDegrees = isFullCircle ? 359.999 : (count.percent / 100) * 360;
    const endAngle =
      index === visibleCounts.length - 1 && !isFullCircle
        ? 360
        : startAngle + segmentDegrees;
    const path = buildDonutPath(
      startAngle,
      endAngle,
      options.outerRadius,
      options.innerRadius,
      options.center
    );
    startAngle = endAngle;
    return { ...count, path };
  });
}

export function formatStatusSectionLabel(
  label: string,
  count: number,
  percentValue: number
): string {
  return `${label}: ${count} (${formatPercent(percentValue)})`;
}

export function normaliseMonitorVisualStatus(
  monitor: MonitorVisualInput
): MonitorVisualStatus {
  if (!monitor.enabled) return "paused";

  switch (monitor.state?.lastStatus) {
    case "up":
    case "operational":
      return "up";
    case "down":
      return "down";
    case "degraded":
      return "degraded";
    default:
      return "unknown";
  }
}

export function normaliseComponentVisualStatus(
  status: string | null | undefined
): ComponentVisualStatus {
  switch (status) {
    case "operational":
    case "degraded":
    case "down":
    case "maintenance":
      return status;
    default:
      return "unknown";
  }
}

export function buildMonitorStatusCounts(
  monitors: MonitorVisualInput[]
): StatusCount<MonitorVisualStatus>[] {
  const counts = new Map<MonitorVisualStatus, number>(
    MONITOR_STATUS_ORDER.map((status) => [status, 0])
  );

  for (const monitor of monitors) {
    const status = normaliseMonitorVisualStatus(monitor);
    counts.set(status, (counts.get(status) || 0) + 1);
  }

  return MONITOR_STATUS_ORDER.map((status) => ({
    status,
    count: counts.get(status) || 0,
    percent: percent(counts.get(status) || 0, monitors.length),
  }));
}

export function buildComponentStatusCounts(
  components: ComponentVisualInput[]
): StatusCount<ComponentVisualStatus>[] {
  const counts = new Map<ComponentVisualStatus, number>(
    COMPONENT_STATUS_ORDER.map((status) => [status, 0])
  );

  for (const component of components) {
    const status = normaliseComponentVisualStatus(component.currentStatus);
    counts.set(status, (counts.get(status) || 0) + 1);
  }

  return COMPONENT_STATUS_ORDER.map((status) => ({
    status,
    count: counts.get(status) || 0,
    percent: percent(counts.get(status) || 0, components.length),
  }));
}

export function getAverageLatencyMs(monitors: MonitorVisualInput[]): number | null {
  let total = 0;
  let count = 0;

  for (const monitor of monitors) {
    const latency = monitor.state?.lastLatencyMs;
    if (typeof latency !== "number") continue;
    total += latency;
    count++;
  }

  return count > 0 ? Math.round(total / count) : null;
}

export function buildTypeCounts(monitors: MonitorVisualInput[]) {
  const counts = new Map<string, number>();
  for (const monitor of monitors) {
    counts.set(monitor.type, (counts.get(monitor.type) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count, percent: percent(count, monitors.length) }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

export function getLinkedMonitorCoverage(components: ComponentVisualInput[]): number {
  if (!components.length) return 0;
  const linked = components.filter((component) => component.monitorIds.length > 0).length;
  return percent(linked, components.length);
}

export function getAverageComponentMonitorCount(
  components: ComponentVisualInput[]
): number {
  if (!components.length) return 0;
  const total = components.reduce(
    (sum, component) => sum + component.monitorIds.length,
    0
  );
  return total / components.length;
}

export function getAverageComponentDependencyCount(
  components: ComponentVisualInput[]
): number {
  if (!components.length) return 0;
  const total = components.reduce(
    (sum, component) => sum + component.dependencyIds.length,
    0
  );
  return total / components.length;
}
