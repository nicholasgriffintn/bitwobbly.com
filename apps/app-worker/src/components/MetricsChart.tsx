import { useState, useEffect } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getMonitorMetricsFn } from '@/server/functions/monitors';

type MetricsData = {
  timestamp: string;
  latency_ms: number;
  up_count: number;
  down_count: number;
  uptime_percentage: number;
}[];

type MetricsResponse = {
  metrics: MetricsData;
  summary: {
    uptime_percentage: number;
    total_checks: number;
    period_hours: number;
    start_time: string;
    end_time: string;
  };
};

interface MetricsChartProps {
  monitorId: string;
}

export function MetricsChart({ monitorId }: MetricsChartProps) {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState('24');

  const getMetrics = useServerFn(getMonitorMetricsFn);

  useEffect(() => {
    if (!monitorId) return;

    let cancelled = false;
    async function loadMetrics() {
      setLoading(true);
      setError(null);
      try {
        const metricsData = await getMetrics({ data: { monitorId, hours: Number(hours) } });

        if (!cancelled) {
          setData(metricsData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load metrics');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMetrics();
    return () => { cancelled = true; };
  }, [monitorId, hours]);

  return (
    <div className="card">
      <div className="card-title">Historical Performance</div>

      <div className="form mb-4">
        <label htmlFor="hours-range">Time Range</label>
        <select
          id="hours-range"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-auto inline-block"
        >
          <option value="1">Last 1 hour</option>
          <option value="6">Last 6 hours</option>
          <option value="24">Last 24 hours</option>
          <option value="72">Last 3 days</option>
          <option value="168">Last 7 days</option>
        </select>
      </div>

      {loading && <div>Loading metrics...</div>}
      {error && <div className="error">{error}</div>}

      {data && (
        <div>
          <div className="grid three mb-4">
            <div className="text-center">
              <div
                className="font-bold text-2xl"
                style={{
                  color:
                    data.summary.uptime_percentage >= 99
                      ? '#28a745'
                      : data.summary.uptime_percentage >= 95
                        ? '#ffc107'
                        : '#dc3545',
                }}
              >
                {data.summary.uptime_percentage.toFixed(2)}%
              </div>
              <div className="muted">Uptime</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {data.metrics.length > 0
                  ? `${(data.metrics.reduce((sum, m) => sum + m.latency_ms, 0) / data.metrics.length).toFixed(0)}ms`
                  : '0ms'}
              </div>
              <div className="muted">Avg Latency</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {data.summary.total_checks}
              </div>
              <div className="muted">Total Checks</div>
            </div>
          </div>

          {data.metrics.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Response Time Trend</h4>
              <div style={{ overflowX: 'auto' }}>
                <svg
                  width="100%"
                  height="200"
                  viewBox={`0 0 ${Math.max(data.metrics.length * 20, 400)} 200`}
                  preserveAspectRatio="none"
                  aria-label="Response time chart showing latency trends over time"
                >
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map((percent) => (
                    <g key={`grid-${percent}`}>
                      <line
                        x1="0"
                        y1={200 - (percent / 100) * 200}
                        x2={Math.max(data.metrics.length * 20, 400)}
                        y2={200 - (percent / 100) * 200}
                        stroke="#e0e0e0"
                        strokeWidth="1"
                      />
                      <text
                        x="5"
                        y={200 - (percent / 100) * 200 + 15}
                        fontSize="12"
                        fill="#666"
                      >
                        {`${percent}ms`}
                      </text>
                    </g>
                  ))}

                  {/* Latency line */}
                  <polyline
                    points={data.metrics
                      .map(
                        (m) =>
                          `${data.metrics.indexOf(m) * 20 + 10},${200 - Math.min((m.latency_ms / 100) * 200, 200)}`,
                      )
                      .join(' ')}
                    fill="none"
                    stroke="#007bff"
                    strokeWidth="2"
                  />

                  {/* Data points */}
                  {data.metrics.map((m) => (
                    <circle
                      key={`${m.timestamp}-${m.latency_ms}`}
                      cx={data.metrics.indexOf(m) * 20 + 10}
                      cy={200 - Math.min((m.latency_ms / 100) * 200, 200)}
                      r="3"
                      fill="#007bff"
                    />
                  ))}
                </svg>
              </div>
              <div className="muted" style={{ fontSize: '0.875rem' }}>
                Response time over time (each point represents an hour)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
