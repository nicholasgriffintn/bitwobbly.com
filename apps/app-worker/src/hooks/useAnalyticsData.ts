import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

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

export interface VolumeStats {
  total_events: number;
  accepted_events: number;
  filtered_events: number;
  dropped_events: number;
}

export interface TimeseriesData {
  timestamp: string;
  accepted: number;
  filtered: number;
  dropped: number;
}

export interface SDKData {
  sdk_name: string;
  event_count: number;
  percentage: number;
}

export interface TopError {
  message: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
}

export interface ReleaseStat {
  release: string;
  environment: string;
  error_count: number;
  user_count: number;
}

export interface ReleaseHealth {
  release: string | null;
  environment: string | null;
  total_sessions: number;
  crashed_sessions: number;
  errored_sessions: number;
  crash_free_rate: number;
}

export interface ClientReport {
  id: string;
  timestamp: number;
  discardedEvents: Array<{
    reason: string;
    category: string;
    quantity: number;
  }> | null;
}

type AsyncState<T> = {
  data: T;
  loading: boolean;
};

export function useAnalyticsData(projectId: string) {
  const [volumeStats, setVolumeStats] = useState<
    AsyncState<VolumeStats | null>
  >({ data: null, loading: true });
  const [timeseriesBreakdown, setTimeseriesBreakdown] = useState<
    AsyncState<TimeseriesData[]>
  >({ data: [], loading: true });
  const [sdkDistribution, setSdkDistribution] = useState<
    AsyncState<SDKData[]>
  >({ data: [], loading: true });
  const [topErrors, setTopErrors] = useState<AsyncState<TopError[]>>({
    data: [],
    loading: true,
  });
  const [releaseStats, setReleaseStats] = useState<AsyncState<ReleaseStat[]>>({
    data: [],
    loading: true,
  });
  const [releaseHealth, setReleaseHealth] = useState<
    AsyncState<ReleaseHealth[]>
  >({
    data: [],
    loading: true,
  });
  const [clientReports, setClientReports] = useState<
    AsyncState<ClientReport[]>
  >({
    data: [],
    loading: true,
  });

  const getStats = useServerFn(getEventVolumeStatsFn);
  const getTimeseriesBreakdown = useServerFn(
    getEventVolumeTimeseriesBreakdownFn
  );
  const getTopErrors = useServerFn(getTopErrorMessagesFn);
  const getReleaseStats = useServerFn(getErrorRateByReleaseFn);
  const getSDKDist = useServerFn(getSDKDistributionFn);
  const getReleaseHealth = useServerFn(getSentryReleaseHealthFn);
  const listClientReports = useServerFn(listSentryClientReportsFn);

  const activeRequestId = useRef(0);

  useEffect(() => {
    const requestId = ++activeRequestId.current;
    const isCurrent = () => activeRequestId.current === requestId;
    const endDate = new Date().toISOString();
    const startDate = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();
    const since = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;
    const until = Math.floor(Date.now() / 1000);

    setVolumeStats((prev) => ({ data: prev.data, loading: true }));
    setTimeseriesBreakdown((prev) => ({ data: prev.data, loading: true }));
    setSdkDistribution((prev) => ({ data: prev.data, loading: true }));
    setTopErrors((prev) => ({ data: prev.data, loading: true }));
    setReleaseStats((prev) => ({ data: prev.data, loading: true }));
    setReleaseHealth((prev) => ({ data: prev.data, loading: true }));
    setClientReports((prev) => ({ data: prev.data, loading: true }));

    getStats({ data: { projectId, startDate, endDate } })
      .then((data) => {
        if (!isCurrent()) return;
        setVolumeStats({ data, loading: false });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setVolumeStats({ data: null, loading: false });
      });

    getTimeseriesBreakdown({
      data: { projectId, startDate, endDate, interval: "hour" },
    })
      .then((data) => {
        if (!isCurrent()) return;
        setTimeseriesBreakdown({ data, loading: false });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setTimeseriesBreakdown({ data: [], loading: false });
      });

    getSDKDist({ data: { projectId, startDate, endDate } })
      .then((data) => {
        if (!isCurrent()) return;
        setSdkDistribution({ data, loading: false });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setSdkDistribution({ data: [], loading: false });
      });

    getTopErrors({ data: { projectId, limit: 10 } })
      .then((data) => {
        if (!isCurrent()) return;
        setTopErrors({ data, loading: false });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setTopErrors({ data: [], loading: false });
      });

    getReleaseStats({
      data: { projectId, startDate, endDate },
    })
      .then((data) => {
        if (!isCurrent()) return;
        setReleaseStats({ data, loading: false });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setReleaseStats({ data: [], loading: false });
      });

    getReleaseHealth({ data: { projectId, since, until } })
      .then((res) => {
        if (!isCurrent()) return;
        setReleaseHealth({ data: res.health, loading: false });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setReleaseHealth({ data: [], loading: false });
      });

    listClientReports({
      data: { projectId, since, until, limit: 50 },
    })
      .then((res) => {
        if (!isCurrent()) return;
        setClientReports({ data: res.reports, loading: false });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setClientReports({ data: [], loading: false });
      });

    return () => {
      activeRequestId.current += 1;
    };
  }, [
    getReleaseHealth,
    getReleaseStats,
    getSDKDist,
    getStats,
    getTimeseriesBreakdown,
    getTopErrors,
    listClientReports,
    projectId,
  ]);

  return {
    volumeStats,
    timeseriesBreakdown,
    sdkDistribution,
    topErrors,
    releaseStats,
    releaseHealth,
    clientReports,
  };
}
