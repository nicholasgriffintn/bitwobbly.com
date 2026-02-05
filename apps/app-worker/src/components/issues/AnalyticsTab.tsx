import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";

import { EventMetrics } from "@/components/EventMetrics";
import { EventVolumeChart } from "@/components/EventVolumeChart";
import { SDKDistributionChart } from "@/components/SDKDistributionChart";
import { toTitleCase } from "@/utils/format";
import { formatRelativeTime } from "@/utils/time";
import {
  getEventVolumeStatsFn,
  getEventVolumeTimeseriesBreakdownFn,
  getTopErrorMessagesFn,
  getErrorRateByReleaseFn,
  getSDKDistributionFn,
} from "@/server/functions/sentry-analytics";
import {
  getSentryReleaseHealthFn,
  listSentryClientReportsFn,
} from "@/server/functions/sentry";

interface AnalyticsTabProps {
  projectId: string;
}

interface VolumeStats {
  total_events: number;
  accepted_events: number;
  filtered_events: number;
  dropped_events: number;
}

interface TimeseriesData {
  timestamp: string;
  accepted: number;
  filtered: number;
  dropped: number;
}

interface SDKData {
  sdk_name: string;
  event_count: number;
  percentage: number;
}

interface TopError {
  message: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
}

interface ReleaseStat {
  release: string;
  environment: string;
  error_count: number;
  user_count: number;
}

interface ReleaseHealth {
  release: string | null;
  environment: string | null;
  total_sessions: number;
  crashed_sessions: number;
  errored_sessions: number;
  crash_free_rate: number;
}

interface ClientReport {
  id: string;
  timestamp: number;
  discardedEvents: Array<{
    reason: string;
    category: string;
    quantity: number;
  }> | null;
}

export function AnalyticsTab({ projectId }: AnalyticsTabProps) {
  const [volumeStats, setVolumeStats] = useState<{
    data: VolumeStats | null;
    loading: boolean;
  }>({ data: null, loading: true });
  const [timeseriesBreakdown, setTimeseriesBreakdown] = useState<{
    data: TimeseriesData[];
    loading: boolean;
  }>({ data: [], loading: true });
  const [sdkDistribution, setSdkDistribution] = useState<{
    data: SDKData[];
    loading: boolean;
  }>({ data: [], loading: true });
  const [topErrors, setTopErrors] = useState<{
    data: TopError[];
    loading: boolean;
  }>({ data: [], loading: true });
  const [releaseStats, setReleaseStats] = useState<{
    data: ReleaseStat[];
    loading: boolean;
  }>({ data: [], loading: true });
  const [releaseHealth, setReleaseHealth] = useState<{
    data: ReleaseHealth[];
    loading: boolean;
  }>({ data: [], loading: true });
  const [clientReports, setClientReports] = useState<{
    data: ClientReport[];
    loading: boolean;
  }>({ data: [], loading: true });

  const getStats = useServerFn(getEventVolumeStatsFn);
  const getTimeseriesBreakdown = useServerFn(
    getEventVolumeTimeseriesBreakdownFn
  );
  const getTopErrors = useServerFn(getTopErrorMessagesFn);
  const getReleaseStats = useServerFn(getErrorRateByReleaseFn);
  const getSDKDist = useServerFn(getSDKDistributionFn);
  const getReleaseHealth = useServerFn(getSentryReleaseHealthFn);
  const listClientReports = useServerFn(listSentryClientReportsFn);

  useEffect(() => {
    const endDate = new Date().toISOString();
    const startDate = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();

    getStats({ data: { projectId, startDate, endDate } })
      .then((data) => setVolumeStats({ data, loading: false }))
      .catch(() => setVolumeStats({ data: null, loading: false }));

    getTimeseriesBreakdown({
      data: { projectId, startDate, endDate, interval: "hour" },
    })
      .then((data) => setTimeseriesBreakdown({ data, loading: false }))
      .catch(() => setTimeseriesBreakdown({ data: [], loading: false }));

    getSDKDist({ data: { projectId, startDate, endDate } })
      .then((data) => setSdkDistribution({ data, loading: false }))
      .catch(() => setSdkDistribution({ data: [], loading: false }));

    getTopErrors({ data: { projectId, limit: 10 } })
      .then((data) => setTopErrors({ data, loading: false }))
      .catch(() => setTopErrors({ data: [], loading: false }));

    getReleaseStats({ data: { projectId, startDate, endDate } })
      .then((data) => setReleaseStats({ data, loading: false }))
      .catch(() => setReleaseStats({ data: [], loading: false }));

    const since = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
    const until = Math.floor(Date.now() / 1000);

    getReleaseHealth({ data: { projectId, since, until } })
      .then((res) => setReleaseHealth({ data: res.health, loading: false }))
      .catch(() => setReleaseHealth({ data: [], loading: false }));

    listClientReports({ data: { projectId, since, until, limit: 50 } })
      .then((res) => setClientReports({ data: res.reports, loading: false }))
      .catch(() => setClientReports({ data: [], loading: false }));
  }, [projectId]);

  return (
    <div className="rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--bg)] p-4">
      <div>
        {volumeStats.loading ? (
          <div className="grid metrics mb-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card skeleton h-20" />
            ))}
          </div>
        ) : volumeStats.data ? (
          <EventMetrics stats={volumeStats.data} />
        ) : null}

        <div className="card mb-1.5">
          <div className="card-title">Event Volume (Last 14 Days)</div>
          {timeseriesBreakdown.loading ? (
            <div className="skeleton h-[400px]" />
          ) : timeseriesBreakdown.data.length > 0 ? (
            <EventVolumeChart data={timeseriesBreakdown.data} />
          ) : (
            <div className="muted p-8">No event data available</div>
          )}
        </div>

        <div className="grid two mb-1.5">
          <div className="card">
            <div className="card-title">SDK Distribution</div>
            {sdkDistribution.loading ? (
              <div className="skeleton h-[200px]" />
            ) : sdkDistribution.data.length > 0 ? (
              <SDKDistributionChart data={sdkDistribution.data} />
            ) : (
              <div className="muted p-8">No SDK data available</div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Top Error Messages</div>
            {topErrors.loading ? (
              <div className="list">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="list-item skeleton h-12" />
                ))}
              </div>
            ) : topErrors.data.length > 0 ? (
              <div className="list">
                {topErrors.data.slice(0, 5).map((error, idx) => (
                  <div key={idx} className="list-item">
                    <div className="flex-1">
                      <div className="list-title">{error.message}</div>
                      <div className="muted mt-1">
                        {error.event_count} occurrences
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted p-8">No error data available</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Error Rate by Release</div>
          {releaseStats.loading ? (
            <div className="list">
              {[1, 2, 3].map((i) => (
                <div key={i} className="list-item skeleton h-12" />
              ))}
            </div>
          ) : releaseStats.data.length > 0 ? (
            <div className="list">
              {releaseStats.data.slice(0, 10).map((stat, idx) => (
                <div key={idx} className="list-item">
                  <div className="flex-1">
                    <div className="list-title">
                      {stat.release || "Unknown Release"}
                      {stat.environment && (
                        <span className="pill small ml-2">
                          {toTitleCase(stat.environment)}
                        </span>
                      )}
                    </div>
                    <div className="muted mt-1">
                      {stat.error_count} errors · {stat.user_count} users
                      affected
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted p-8">No release data available</div>
          )}
        </div>

        <div className="grid two mt-1.5">
          <div className="card">
            <div className="card-title">
              Release Health (Crash-free Sessions)
            </div>
            {releaseHealth.loading ? (
              <div className="list">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="list-item skeleton h-12" />
                ))}
              </div>
            ) : releaseHealth.data.length > 0 ? (
              <div className="list">
                {releaseHealth.data.slice(0, 10).map((row, idx) => (
                  <div key={idx} className="list-item">
                    <div className="flex-1">
                      <div className="list-title">
                        {row.release || "Unknown Release"}
                        {row.environment ? (
                          <span className="pill small ml-2">
                            {toTitleCase(row.environment)}
                          </span>
                        ) : null}
                      </div>
                      <div className="muted mt-1">
                        {(row.crash_free_rate * 100).toFixed(2)}% crash-free ·{" "}
                        {row.total_sessions} sessions · {row.crashed_sessions}{" "}
                        crashed
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted p-8">No session data available</div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Client Reports</div>
            {clientReports.loading ? (
              <div className="list">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="list-item skeleton h-12" />
                ))}
              </div>
            ) : clientReports.data.length > 0 ? (
              <div className="list">
                {clientReports.data.slice(0, 10).map((report) => (
                  <div key={report.id} className="list-item">
                    <div className="flex-1">
                      <div className="list-title">
                        {formatRelativeTime(report.timestamp)}
                      </div>
                      <div className="muted mt-1">
                        {report.discardedEvents?.length
                          ? report.discardedEvents
                              .slice(0, 3)
                              .map(
                                (e) =>
                                  `${e.category}:${e.reason} (${e.quantity})`
                              )
                              .join(", ")
                          : "No discarded event details"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted p-8">No client report data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
