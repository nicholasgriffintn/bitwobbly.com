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
  const query = `
    SELECT
      DATE(FROM_UNIXTIME(received_at)) as day,
      sdk_name,
      sdk_version,
      COUNT(*) as event_count,
      SUM(item_length_bytes) as total_bytes
    FROM default.sentry_manifests
    WHERE
      item_type IN ('event', 'transaction')
      AND received_at BETWEEN UNIX_TIMESTAMP('${startDate}') AND UNIX_TIMESTAMP('${endDate}')
    GROUP BY day, sdk_name, sdk_version
    ORDER BY event_count DESC
  `;

  const result = await executeR2SQL<EventVolumeBySDK>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );
  return result.data;
}

export async function getClockDriftStats(
  config: R2SQLConfig,
): Promise<ClockDriftStats[]> {
  const query = `
    SELECT
      sdk_name,
      AVG(sent_at_drift_ms / 1000.0) as avg_drift_seconds,
      MAX(sent_at_drift_ms / 1000.0) as max_drift_seconds,
      MIN(sent_at_drift_ms / 1000.0) as min_drift_seconds
    FROM default.sentry_manifests
    WHERE sent_at IS NOT NULL AND sent_at_drift_ms IS NOT NULL
    GROUP BY sdk_name
    ORDER BY avg_drift_seconds DESC
  `;

  const result = await executeR2SQL<ClockDriftStats>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );
  return result.data;
}

export async function getItemTypeDistribution(
  config: R2SQLConfig,
  startDate: string,
  endDate: string,
): Promise<ItemTypeDistribution[]> {
  const query = `
    SELECT
      item_type,
      COUNT(*) as count,
      SUM(item_length_bytes) / 1024.0 / 1024.0 as total_mb
    FROM default.sentry_manifests
    WHERE received_at BETWEEN UNIX_TIMESTAMP('${startDate}') AND UNIX_TIMESTAMP('${endDate}')
    GROUP BY item_type
    ORDER BY count DESC
  `;

  const result = await executeR2SQL<ItemTypeDistribution>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );
  return result.data;
}

export async function getErrorRateByRelease(
  config: R2SQLConfig,
  projectId: number,
  startDate: string,
  endDate: string,
): Promise<ErrorRateByRelease[]> {
  const query = `
    SELECT
      event_release as release,
      event_environment as environment,
      COUNT(*) as error_count,
      COUNT(DISTINCT event_user_id) as user_count
    FROM default.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND item_type = 'event'
      AND event_release IS NOT NULL
      AND received_at BETWEEN UNIX_TIMESTAMP('${startDate}') AND UNIX_TIMESTAMP('${endDate}')
    GROUP BY release, environment
    ORDER BY error_count DESC
    LIMIT 50
  `;

  const result = await executeR2SQL<ErrorRateByRelease>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );
  return result.data;
}

export async function getTopErrorMessages(
  config: R2SQLConfig,
  projectId: number,
  limit: number = 20,
): Promise<TopErrorMessages[]> {
  const query = `
    SELECT
      event_message as message,
      COUNT(*) as event_count,
      MIN(FROM_UNIXTIME(received_at)) as first_seen,
      MAX(FROM_UNIXTIME(received_at)) as last_seen
    FROM default.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND item_type = 'event'
      AND event_message IS NOT NULL
    GROUP BY message
    ORDER BY event_count DESC
    LIMIT ${limit}
  `;

  const result = await executeR2SQL<TopErrorMessages>(
    config,
    "bitwobbly-sentry-catalog",
    query,
  );
  return result.data;
}

export async function getEventVolumeTimeseries(
  config: R2SQLConfig,
  projectId: number,
  startDate: string,
  endDate: string,
  interval: "hour" | "day" = "hour",
): Promise<{ timestamp: string; event_count: number }[]> {
  const dateFormat =
    interval === "hour" ? "DATE_FORMAT('%Y-%m-%d %H:00:00')" : "DATE";

  const query = `
    SELECT
      ${dateFormat}(FROM_UNIXTIME(received_at)) as timestamp,
      COUNT(*) as event_count
    FROM default.sentry_manifests
    WHERE
      sentry_project_id = ${projectId}
      AND item_type IN ('event', 'transaction')
      AND received_at BETWEEN UNIX_TIMESTAMP('${startDate}') AND UNIX_TIMESTAMP('${endDate}')
    GROUP BY timestamp
    ORDER BY timestamp ASC
  `;

  const result = await executeR2SQL<{
    timestamp: string;
    event_count: number;
  }>(config, "bitwobbly-sentry-catalog", query);
  return result.data;
}
