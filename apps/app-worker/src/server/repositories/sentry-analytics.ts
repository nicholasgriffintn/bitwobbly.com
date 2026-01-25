import { executeR2SQL, type R2SQLConfig } from "../lib/r2-sql";

export interface EventVolumeBySDK {
  day: string;
  sdk_name: string;
  sdk_version: string;
  event_count: number;
  total_bytes: number;
}

export interface ClockDriftStats {
  sdk_name: string;
  avg_drift_seconds: number;
  max_drift_seconds: number;
  min_drift_seconds: number;
}

export interface ItemTypeDistribution {
  item_type: string;
  count: number;
  total_mb: number;
}

export interface ErrorRateByRelease {
  release: string;
  environment: string;
  error_count: number;
  user_count: number;
}

export interface TopErrorMessages {
  message: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
}

export async function getEventVolumeBySDK(
  config: R2SQLConfig,
  startDate: string,
  endDate: string,
): Promise<EventVolumeBySDK[]> {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  const query = `
    SELECT
      sdk_name,
      sdk_version,
      COUNT(*),
      SUM(item_length_bytes)
    FROM sentry.sentry_manifests
    WHERE
      item_type = 'event'
      AND received_at >= ${startTimestamp}
      AND received_at <= ${endTimestamp}
    GROUP BY sdk_name, sdk_version
    LIMIT 10000
  `;

  interface RawResult {
    sdk_name: string;
    sdk_version: string;
    count: number;
    sum: number;
  }

  const result = await executeR2SQL<RawResult>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );

  const grouped = new Map<string, EventVolumeBySDK>();
  for (const row of result.data) {
    const [sdk_name, sdk_version, count, bytes] = Object.values(row);
    const day = startDate.split("T")[0];
    const key = `${day}|${sdk_name}|${sdk_version}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        day,
        sdk_name: sdk_name as string,
        sdk_version: sdk_version as string,
        event_count: count as number,
        total_bytes: bytes as number,
      });
    } else {
      const existing = grouped.get(key)!;
      existing.event_count += count as number;
      existing.total_bytes += bytes as number;
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => b.event_count - a.event_count,
  );
}

export async function getClockDriftStats(
  config: R2SQLConfig,
): Promise<ClockDriftStats[]> {
  const query = `
    SELECT
      sdk_name,
      AVG(sent_at_drift_ms),
      MAX(sent_at_drift_ms),
      MIN(sent_at_drift_ms)
    FROM sentry.sentry_manifests
    WHERE sent_at IS NOT NULL AND sent_at_drift_ms IS NOT NULL
    GROUP BY sdk_name
    LIMIT 10000
  `;

  interface RawResult {
    sdk_name: string;
    avg: number;
    max: number;
    min: number;
  }

  const result = await executeR2SQL<RawResult>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );

  return result.data
    .map((row) => {
      const [sdk_name, avg, max, min] = Object.values(row);
      return {
        sdk_name: sdk_name as string,
        avg_drift_seconds: (avg as number) / 1000.0,
        max_drift_seconds: (max as number) / 1000.0,
        min_drift_seconds: (min as number) / 1000.0,
      };
    })
    .sort((a, b) => b.avg_drift_seconds - a.avg_drift_seconds);
}

export async function getItemTypeDistribution(
  config: R2SQLConfig,
  startDate: string,
  endDate: string,
): Promise<ItemTypeDistribution[]> {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  const query = `
    SELECT
      item_type,
      COUNT(*),
      SUM(item_length_bytes)
    FROM sentry.sentry_manifests
    WHERE received_at >= ${startTimestamp} AND received_at <= ${endTimestamp}
    GROUP BY item_type
    LIMIT 10000
  `;

  interface RawResult {
    item_type: string;
    count: number;
    sum: number;
  }

  const result = await executeR2SQL<RawResult>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );

  return result.data
    .map((row) => {
      const [item_type, count, sum_bytes] = Object.values(row);
      return {
        item_type: item_type as string,
        count: count as number,
        total_mb: (sum_bytes as number) / 1024.0 / 1024.0,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export async function getErrorRateByRelease(
  config: R2SQLConfig,
  projectId: number,
  startDate: string,
  endDate: string,
): Promise<ErrorRateByRelease[]> {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  const query = `
    SELECT
      event_release,
      event_environment,
      event_user_id,
      COUNT(*)
    FROM sentry.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND item_type = 'event'
      AND event_release IS NOT NULL
      AND received_at >= ${startTimestamp}
      AND received_at <= ${endTimestamp}
    GROUP BY event_release, event_environment, event_user_id
    LIMIT 10000
  `;

  interface RawResult {
    event_release: string;
    event_environment: string;
    event_user_id: string | null;
    count: number;
  }

  const result = await executeR2SQL<RawResult>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );

  const grouped = new Map<string, ErrorRateByRelease>();
  for (const row of result.data) {
    const [release, environment, user_id, count] = Object.values(row);
    const key = `${release}|${environment}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        release: release as string,
        environment: environment as string,
        error_count: count as number,
        user_count: 0,
      });
    } else {
      const existing = grouped.get(key)!;
      existing.error_count += count as number;
    }

    const validUserId =
      user_id && typeof user_id === "string" && !user_id.startsWith("{");
    if (validUserId) {
      grouped.get(key)!.user_count++;
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.error_count - a.error_count)
    .slice(0, 50);
}

export async function getTopErrorMessages(
  config: R2SQLConfig,
  projectId: number,
  limit: number = 20,
): Promise<TopErrorMessages[]> {
  const query = `
    SELECT
      event_message,
      received_at,
      COUNT(*)
    FROM sentry.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND item_type = 'event'
      AND event_message IS NOT NULL
    GROUP BY event_message, received_at
    LIMIT 10000
  `;

  interface RawResult {
    event_message: string;
    received_at: number;
    count: number;
  }

  const result = await executeR2SQL<RawResult>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );

  const grouped = new Map<string, TopErrorMessages>();
  for (const row of result.data) {
    const [message, received_at, count] = Object.values(row);
    const msgKey = message as string;

    if (!grouped.has(msgKey)) {
      grouped.set(msgKey, {
        message: msgKey,
        event_count: count as number,
        first_seen: new Date((received_at as number) * 1000).toISOString(),
        last_seen: new Date((received_at as number) * 1000).toISOString(),
      });
    } else {
      const existing = grouped.get(msgKey)!;
      existing.event_count += count as number;
      const currentTimestamp = (received_at as number) * 1000;
      if (currentTimestamp < new Date(existing.first_seen).getTime()) {
        existing.first_seen = new Date(currentTimestamp).toISOString();
      }
      if (currentTimestamp > new Date(existing.last_seen).getTime()) {
        existing.last_seen = new Date(currentTimestamp).toISOString();
      }
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.event_count - a.event_count)
    .slice(0, limit);
}

export async function getEventVolumeTimeseries(
  config: R2SQLConfig,
  projectId: number,
  startDate: string,
  endDate: string,
  interval: "hour" | "day" = "hour",
): Promise<{ timestamp: string; event_count: number }[]> {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  const query = `
    SELECT
      received_at,
      COUNT(*)
    FROM sentry.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND item_type = 'event'
      AND received_at >= ${startTimestamp}
      AND received_at <= ${endTimestamp}
    GROUP BY received_at
    LIMIT 10000
  `;

  interface RawResult {
    received_at: number;
    count: number;
  }

  const result = await executeR2SQL<RawResult>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );

  const intervalMs = interval === "hour" ? 3600000 : 86400000;
  const grouped = new Map<string, number>();

  for (const row of result.data) {
    const [received_at, count] = Object.values(row);
    const timestamp = (received_at as number) * 1000;
    const bucketTimestamp = Math.floor(timestamp / intervalMs) * intervalMs;
    const bucketKey = new Date(bucketTimestamp).toISOString();

    if (interval === "hour") {
      const hourBucket = bucketKey.substring(0, 13) + ":00:00.000Z";
      grouped.set(
        hourBucket,
        (grouped.get(hourBucket) || 0) + (count as number),
      );
    } else {
      const dayBucket = bucketKey.substring(0, 10);
      grouped.set(dayBucket, (grouped.get(dayBucket) || 0) + (count as number));
    }
  }

  return Array.from(grouped.entries())
    .map(([timestamp, event_count]) => ({ timestamp, event_count }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export interface EventVolumeStats {
  total_events: number;
  accepted_events: number;
  filtered_events: number;
  dropped_events: number;
}

export async function getEventVolumeStats(
  config: R2SQLConfig,
  projectId: number,
  startDate: string,
  endDate: string,
): Promise<EventVolumeStats> {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  const query = `
    SELECT
      COUNT(*)
    FROM sentry.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND received_at >= ${startTimestamp}
      AND received_at <= ${endTimestamp}
  `;

  interface RawResult {
    count: number;
  }

  const result = await executeR2SQL<RawResult>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );

  const acceptedEvents = result.data[0]
    ? (Object.values(result.data[0])[0] as number)
    : 0;

  return {
    total_events: acceptedEvents,
    accepted_events: acceptedEvents,
    filtered_events: 0,
    dropped_events: 0,
  };
}

export interface EventVolumeTimeseriesBreakdown {
  timestamp: string;
  accepted: number;
  filtered: number;
  dropped: number;
}

export async function getEventVolumeTimeseriesBreakdown(
  config: R2SQLConfig,
  projectId: number,
  startDate: string,
  endDate: string,
  interval: "hour" | "day" = "hour",
): Promise<EventVolumeTimeseriesBreakdown[]> {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  const query = `
    SELECT
      received_at,
      COUNT(*)
    FROM sentry.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND received_at >= ${startTimestamp}
      AND received_at <= ${endTimestamp}
    GROUP BY received_at
    LIMIT 10000
  `;

  interface RawResult {
    received_at: number;
    count: number;
  }

  const result = await executeR2SQL<RawResult>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );

  const intervalMs = interval === "hour" ? 3600000 : 86400000;
  const grouped = new Map<string, number>();

  for (const row of result.data) {
    const [received_at, count] = Object.values(row);
    const timestamp = (received_at as number) * 1000;
    const bucketTimestamp = Math.floor(timestamp / intervalMs) * intervalMs;
    const bucketKey = new Date(bucketTimestamp).toISOString();

    if (interval === "hour") {
      const hourBucket = bucketKey.substring(0, 13) + ":00:00.000Z";
      grouped.set(
        hourBucket,
        (grouped.get(hourBucket) || 0) + (count as number),
      );
    } else {
      const dayBucket = bucketKey.substring(0, 10);
      grouped.set(dayBucket, (grouped.get(dayBucket) || 0) + (count as number));
    }
  }

  return Array.from(grouped.entries())
    .map(([timestamp, accepted]) => ({
      timestamp,
      accepted,
      filtered: 0,
      dropped: 0,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export interface SDKDistribution {
  sdk_name: string;
  event_count: number;
  percentage: number;
}

export async function getSDKDistribution(
  config: R2SQLConfig,
  projectId: number,
  startDate: string,
  endDate: string,
): Promise<SDKDistribution[]> {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  const totalQuery = `
    SELECT COUNT(*)
    FROM sentry.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND item_type = 'event'
      AND received_at >= ${startTimestamp}
      AND received_at <= ${endTimestamp}
  `;

  interface TotalResult {
    count: number;
  }

  const totalResult = await executeR2SQL<TotalResult>(
    config,
    "bitwobbly-sentry-catalog",
    totalQuery,
  );

  const total = totalResult.data[0]
    ? (Object.values(totalResult.data[0])[0] as number)
    : 0;

  const distributionQuery = `
    SELECT
      sdk_name,
      COUNT(*)
    FROM sentry.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND item_type = 'event'
      AND received_at >= ${startTimestamp}
      AND received_at <= ${endTimestamp}
    GROUP BY sdk_name
    LIMIT 10000
  `;

  interface DistributionResult {
    sdk_name: string | null;
    count: number;
  }

  const result = await executeR2SQL<DistributionResult>(
    config,
    "bitwobbly-sentry-catalog",
    distributionQuery,
  );

  return result.data
    .map((row) => {
      const [sdk_name, count] = Object.values(row);
      return {
        sdk_name: (sdk_name as string | null) || "Unknown",
        event_count: count as number,
        percentage: total > 0 ? ((count as number) * 100.0) / total : 0,
      };
    })
    .sort((a, b) => b.event_count - a.event_count)
    .slice(0, 10);
}
