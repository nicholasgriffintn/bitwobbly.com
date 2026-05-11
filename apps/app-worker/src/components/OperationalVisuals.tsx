import { useMemo } from "react";

import { Card, CardTitle } from "@/components/layout";
import { Badge } from "@/components/ui";
import { toTitleCase } from "@/utils/format";
import {
  buildStatusCounts,
  buildComponentStatusCounts,
  buildMonitorStatusCounts,
  buildPieSegments,
  buildTypeCounts,
  formatLatencyMs,
  formatPercent,
  formatStatusSectionLabel,
  getAverageComponentDependencyCount,
  getAverageComponentMonitorCount,
  getAverageLatencyMs,
  getLinkedMonitorCoverage,
  normaliseMonitorVisualStatus,
  type ComponentVisualInput,
  type MonitorVisualInput,
  type StatusCount,
} from "@/utils/visualisations";

type MonitorGroup = {
  id: string;
  name: string;
};

type IncidentVisualInput = {
  id: string;
};

const STATUS_COLORS: Record<string, string> = {
  up: "var(--success)",
  operational: "var(--success)",
  down: "var(--primary)",
  degraded: "var(--warning)",
  maintenance: "#1e40af",
  unknown: "var(--muted)",
  paused: "#9a8c7f",
};

const GROUP_COLORS = [
  "var(--success)",
  "var(--primary)",
  "#b85c2c",
  "#1e40af",
  "#7a6f64",
  "#9a8c7f",
];

function getCountLabel(count: StatusCount<string>) {
  return formatStatusSectionLabel(
    count.label || toTitleCase(count.status),
    count.count,
    count.percent
  );
}

function StatusStack<TStatus extends string>({
  counts,
  colorMap = STATUS_COLORS,
}: {
  counts: StatusCount<TStatus>[];
  colorMap?: Record<string, string>;
}) {
  return (
    <div className="visual-stack">
      {counts
        .filter((count) => count.count > 0)
        .map((count) => (
          <span
            key={count.status}
            aria-label={getCountLabel(count)}
            title={getCountLabel(count)}
            style={{
              width: `${count.percent}%`,
              background: colorMap[count.status] || "var(--muted)",
            }}
          />
        ))}
    </div>
  );
}

function DonutChart<TStatus extends string>({
  counts,
  total,
  label,
  colorMap = STATUS_COLORS,
}: {
  counts: StatusCount<TStatus>[];
  total: number;
  label: string;
  colorMap?: Record<string, string>;
}) {
  const segments = buildPieSegments(counts, {
    center: 60,
    innerRadius: 31,
    outerRadius: 50,
  });

  return (
    <div
      className="visual-donut"
      aria-label={`${total} ${label} by current state`}
    >
      <svg
        className="visual-donut-chart"
        viewBox="0 0 120 120"
        role="img"
        aria-label={`${label} status distribution`}
      >
        {segments.map((segment) => (
          <path
            key={segment.status}
            d={segment.path}
            fill={colorMap[segment.status] || "var(--muted)"}
          >
            <title>{getCountLabel(segment)}</title>
          </path>
        ))}
      </svg>
      <span>{total}</span>
      <small>{label}</small>
    </div>
  );
}

function DoubleDonutChart<TOuterStatus extends string, TInnerStatus extends string>({
  outerCounts,
  innerCounts,
  outerColorMap,
  innerColorMap = STATUS_COLORS,
  total,
  label,
}: {
  outerCounts: StatusCount<TOuterStatus>[];
  innerCounts: StatusCount<TInnerStatus>[];
  outerColorMap: Record<string, string>;
  innerColorMap?: Record<string, string>;
  total: number;
  label: string;
}) {
  const outerSegments = buildPieSegments(outerCounts, {
    center: 60,
    innerRadius: 42,
    outerRadius: 52,
  });
  const innerSegments = buildPieSegments(innerCounts, {
    center: 60,
    innerRadius: 28,
    outerRadius: 38,
  });

  return (
    <div className="visual-donut" aria-label={`${total} ${label} by group and status`}>
      <svg
        className="visual-donut-chart"
        viewBox="0 0 120 120"
        role="img"
        aria-label={`${label} distribution by group and status`}
      >
        {outerSegments.map((segment) => (
          <path
            key={`outer-${segment.status}`}
            d={segment.path}
            fill={outerColorMap[segment.status] || "var(--muted)"}
          >
            <title>{getCountLabel(segment)}</title>
          </path>
        ))}
        {innerSegments.map((segment) => (
          <path
            key={`inner-${segment.status}`}
            d={segment.path}
            fill={innerColorMap[segment.status] || "var(--muted)"}
          >
            <title>{getCountLabel(segment)}</title>
          </path>
        ))}
      </svg>
      <span>{total}</span>
      <small>{label}</small>
    </div>
  );
}

function StatusLegend<TStatus extends string>({
  counts,
  colorMap = STATUS_COLORS,
}: {
  counts: StatusCount<TStatus>[];
  colorMap?: Record<string, string>;
}) {
  return (
    <div className="visual-legend">
      {counts
        .filter((count) => count.count > 0)
        .map((count) => (
          <span
            key={count.status}
            title={getCountLabel(count)}
          >
            <i
              style={{
                background: colorMap[count.status] || "var(--muted)",
              }}
            />
            {count.label || toTitleCase(count.status)} {count.count}
          </span>
        ))}
    </div>
  );
}

export function MonitorVisualSummary({
  monitors,
  groups,
}: {
  monitors: MonitorVisualInput[];
  groups: MonitorGroup[];
}) {
  const summary = useMemo(() => {
    const statusCounts = buildMonitorStatusCounts(monitors);
    const typeCounts = buildTypeCounts(monitors);
    const averageLatencyMs = getAverageLatencyMs(monitors);
    const checkingCount = monitors.filter(
      (monitor) => monitor.enabled && monitor.type !== "manual"
    ).length;
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
    const grouped = new Map<string, MonitorVisualInput[]>();

    for (const monitor of monitors) {
      const key = monitor.groupId || "__ungrouped__";
      const items = grouped.get(key) || [];
      items.push(monitor);
      grouped.set(key, items);
    }

    const groupRows = Array.from(grouped.entries())
      .map(([id, items]) => ({
        id,
        name:
          id === "__ungrouped__" ? "Ungrouped" : groupNameById.get(id) || "Group",
        counts: buildMonitorStatusCounts(items),
        total: items.length,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);
    const groupCounts = buildStatusCounts(
      groupRows.map((group) => ({
        status: group.id,
        label: group.name,
        count: group.total,
      }))
    );
    const groupStatusCounts = buildStatusCounts(
      groupRows.flatMap((group) =>
        group.counts.map((count) => ({
          status: count.status,
          count: count.count,
        }))
      )
    );
    const groupColorMap = Object.fromEntries(
      groupRows.map((group, index) => [
        group.id,
        GROUP_COLORS[index % GROUP_COLORS.length],
      ])
    );

    return {
      averageLatencyMs,
      checkingCount,
      groupColorMap,
      groupCounts,
      groupRows,
      groupStatusCounts,
      statusCounts,
      typeCounts,
    };
  }, [groups, monitors]);

  if (!monitors.length) return null;

  return (
    <Card className="monitor-visual-card">
      <CardTitle>Monitor signal</CardTitle>
      <div className="visual-grid visual-grid-three">
        <div className="visual-panel visual-panel-focus">
          <DonutChart
            counts={summary.statusCounts}
            total={monitors.length}
            label="monitors"
          />
          <StatusLegend counts={summary.statusCounts} />
        </div>

        <div className="visual-panel">
          <div className="visual-kicker">Groups</div>
          <div className="visual-panel-focus visual-panel-focus-tight">
            <DoubleDonutChart
              outerCounts={summary.groupCounts}
              innerCounts={summary.groupStatusCounts}
              outerColorMap={summary.groupColorMap}
              total={summary.groupRows.length}
              label="groups"
            />
            <div className="visual-group-legends">
              <StatusLegend
                counts={summary.groupCounts}
                colorMap={summary.groupColorMap}
              />
              <StatusLegend counts={summary.groupStatusCounts} />
            </div>
          </div>
        </div>

        <div className="visual-panel">
          <div className="visual-kicker">Live checks</div>
          <div className="visual-joined-line">
            <strong>{summary.checkingCount}</strong>
            <span>
              live checks · {formatLatencyMs(summary.averageLatencyMs)} average
              latency
            </span>
          </div>
          <div className="visual-chip-row">
            {summary.typeCounts.slice(0, 4).map((item) => (
              <span
                key={item.type}
                className="visual-chip"
                title={`${toTitleCase(item.type)}: ${item.count} monitor${
                  item.count === 1 ? "" : "s"
                }`}
              >
                <span>{toTitleCase(item.type)}</span>
                <strong>{item.count}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ComponentVisualSummary({
  components,
}: {
  components: ComponentVisualInput[];
}) {
  const summary = useMemo(() => {
    const statusCounts = buildComponentStatusCounts(components);
    const coverage = getLinkedMonitorCoverage(components);
    const averageMonitorCount = getAverageComponentMonitorCount(components);
    const averageDependencyCount = getAverageComponentDependencyCount(components);
    const busiest = [...components]
      .sort(
        (a, b) =>
          b.monitorIds.length +
          b.dependencyIds.length -
          (a.monitorIds.length + a.dependencyIds.length)
      )
      .slice(0, 4);

    return {
      averageDependencyCount,
      averageMonitorCount,
      busiest,
      coverage,
      statusCounts,
    };
  }, [components]);

  if (!components.length) return null;

  return (
    <Card>
      <CardTitle>Component map</CardTitle>
      <div className="visual-grid visual-grid-three">
        <div className="visual-panel visual-panel-focus">
          <DonutChart
            counts={summary.statusCounts}
            total={components.length}
            label="components"
          />
          <StatusLegend counts={summary.statusCounts} />
        </div>

        <div className="visual-panel">
          <div className="visual-kicker">Coverage</div>
          <div className="visual-value">{formatPercent(summary.coverage)}</div>
          <div className="muted">Components linked to at least one monitor</div>
          <div className="visual-stat-pair">
            <Badge size="small" variant="success">
              {summary.averageMonitorCount.toFixed(1)} monitors avg
            </Badge>
            <Badge size="small" variant="info">
              {summary.averageDependencyCount.toFixed(1)} deps avg
            </Badge>
          </div>
        </div>

        <div className="visual-panel">
          <div className="visual-kicker">Highest fan-in</div>
          <div className="visual-type-list">
            {summary.busiest.map((component) => (
              <div key={component.id} className="visual-type-row">
                <span>{component.name}</span>
                <strong>
                  {component.monitorIds.length + component.dependencyIds.length}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function OverviewVisualSummary({
  monitors,
  incidents,
  components,
  statusPageCount,
}: {
  monitors: MonitorVisualInput[];
  incidents: IncidentVisualInput[];
  components: ComponentVisualInput[];
  statusPageCount: number;
}) {
  const summary = useMemo(() => {
    const monitorCounts = buildMonitorStatusCounts(monitors);
    const componentCounts = buildComponentStatusCounts(components);
    const activeMonitors = monitors.filter((monitor) => monitor.enabled).length;
    const linkedCoverage = getLinkedMonitorCoverage(components);
    const downMonitors = monitors.filter(
      (monitor) => normaliseMonitorVisualStatus(monitor) === "down"
    ).length;

    return {
      activeMonitors,
      componentCounts,
      downMonitors,
      linkedCoverage,
      monitorCounts,
    };
  }, [components, monitors]);

  if (!monitors.length && !components.length) return null;

  return (
    <Card>
      <div className="visual-overview">
        <div className="visual-count-grid">
          <div className="visual-count-item">
            <span>Monitors up</span>
            <strong className="text-[color:var(--success)]">
              {summary.monitorCounts.find((item) => item.status === "up")
                ?.count || 0}
            </strong>
          </div>
          <div className="visual-count-item">
            <span>Monitors down</span>
            <strong
              className={
                summary.downMonitors > 0 ? "text-[color:var(--primary)]" : ""
              }
            >
              {summary.downMonitors}
            </strong>
          </div>
          <div className="visual-count-item">
            <span>Open incidents</span>
            <strong
              className={
                incidents.length > 0 ? "text-[color:var(--orange)]" : ""
              }
            >
              {incidents.length}
            </strong>
          </div>
          <div className="visual-count-item">
            <span>Status pages</span>
            <strong>{statusPageCount}</strong>
          </div>
        </div>

        <div className="visual-grid visual-grid-three">
          <div className="visual-panel">
            <div className="visual-kicker">Service coverage</div>
            <div className="visual-coverage-line">
              <strong>{formatPercent(summary.linkedCoverage)}</strong>
              <span>
                across {components.length} components · {summary.activeMonitors}{" "}
                active monitors
              </span>
            </div>
          </div>
          <div className="visual-panel">
            <div className="visual-kicker">Monitor health</div>
            <StatusStack counts={summary.monitorCounts} />
            <StatusLegend counts={summary.monitorCounts} />
          </div>
          <div className="visual-panel">
            <div className="visual-kicker">Component status</div>
            <StatusStack counts={summary.componentCounts} />
            <StatusLegend counts={summary.componentCounts} />
          </div>
        </div>
      </div>
    </Card>
  );
}
