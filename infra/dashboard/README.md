# Analytics Dashboard

This is an analytics dashboard set up to make it possible to analyse the data from our monitors and issue tracking systems in an interactive interface.

It uses Trino as the query engine for our issue manifest data that has been stored in the Cloudflare R2 Data Catalog.

It also uses Superset as a visualization layer on top of Trino, allowing us to create charts and dashboard from the data.

## Prerequisites

- Docker installed locally
- R2 bucket with Data Catalog enabled
- R2 API token with both R2 and data catalog permissions

## Setup

Create your environment and configuration files:

```bash
# Copy environment variables template
cp .env.example .env
```

Edit `.env` and fill in your R2 credentials:

**R2 Configuration:**

- `R2_ACCESS_KEY` - Your R2 access key
- `R2_SECRET_KEY` - Your R2 secret key
- `R2_ENDPOINT` - Your R2 endpoint (e.g., `https://<account-id>.r2.cloudflarestorage.com`)

**R2 Data Catalog Configuration:**

- `R2_CATALOG_URI` - Your R2 Data Catalog URI
- `R2_CATALOG_WAREHOUSE` - Your R2 Data Catalog warehouse identifier
- `R2_AUTH_TOKEN` - Your R2 authentication token

**Superset Configuration:**

- `SUPERSET_SECRET_KEY` - Generate with: `python3 -c "import secrets; print(secrets.token_urlsafe(42))"`
- `SUPERSET_ADMIN_USERNAME` - Admin username (default: admin)
- `SUPERSET_ADMIN_PASSWORD` - Admin password (**change this!**)
- `POSTGRES_PASSWORD` - PostgreSQL password (**change this!**)

## Usage

Start the services using Docker Compose:

```bash
docker compose up -d
```

### Superset

Superset will be available at [http://localhost:8088](http://localhost:8088). Log in with the admin credentials you set in the `.env` file.

### Trino

You should be able to access the Trino Web UI at [http://localhost:8080](http://localhost:8080) to see the status of your workers.

You can also connect to the Trino CLI to run queries, first run the following command to access the Trino container:

```bash
docker exec -it dashboard-trino trino
```

## Example Queries

```sql
-- Error Rate Overview (Last 7 Days)
SELECT
  date_trunc('hour', from_unixtime(received_at)) as time_bucket,
  item_type,
  event_release,
  event_environment,
  COUNT(*) as error_count,
  COUNT(DISTINCT event_user_id) as unique_users,
  COUNT(DISTINCT sentry_project_id) as affected_projects,
  AVG(item_length_bytes) / 1024.0 as avg_size_kb
FROM r2.default.issue_manifests
WHERE received_at >= to_unixtime(current_timestamp - interval '7' day)
  AND item_type IN ('event', 'transaction')
GROUP BY 1, 2, 3, 4
ORDER BY time_bucket DESC;

-- SDK Distribution & Performance
SELECT
  sdk_name,
  sdk_version,
  item_type,
  COUNT(*) as event_count,
  SUM(item_length_bytes) / 1024 / 1024.0 as total_mb,
  AVG(item_length_bytes) as avg_bytes,
  AVG(sent_at_drift_ms) / 1000.0 as avg_drift_seconds,
  COUNT(DISTINCT sentry_project_id) as project_count,
  MIN(received_at) as first_seen,
  MAX(received_at) as last_seen
FROM r2.default.issue_manifests
WHERE received_at >= to_unixtime(current_timestamp - interval '30' day)
GROUP BY sdk_name, sdk_version, item_type
ORDER BY event_count DESC;

-- Clock Drift Analysis
SELECT
  sdk_name,
  sdk_version,
  event_environment,
  COUNT(*) as sample_count,
  AVG(sent_at_drift_ms) / 1000.0 as avg_drift_sec,
  STDDEV(sent_at_drift_ms / 1000.0) as drift_stddev,
  MIN(sent_at_drift_ms) / 1000.0 as min_drift_sec,
  MAX(sent_at_drift_ms) / 1000.0 as max_drift_sec,
  APPROX_PERCENTILE(sent_at_drift_ms / 1000.0, 0.5) as median_drift_sec,
  APPROX_PERCENTILE(sent_at_drift_ms / 1000.0, 0.95) as p95_drift_sec
FROM r2.default.issue_manifests
WHERE sent_at IS NOT NULL
  AND sent_at_drift_ms IS NOT NULL
  AND received_at >= to_unixtime(current_timestamp - interval '7' day)
GROUP BY sdk_name, sdk_version, event_environment
HAVING COUNT(*) >= 10
ORDER BY ABS(avg_drift_sec) DESC;

-- Top Error Messages
SELECT
  event_message,
  event_environment,
  event_release,
  COUNT(*) as occurrence_count,
  COUNT(DISTINCT event_user_id) as affected_users,
  MIN(from_unixtime(received_at)) as first_seen,
  MAX(from_unixtime(received_at)) as last_seen,
  ARBITRARY(sentry_project_id) as sample_project_id
FROM r2.default.issue_manifests
WHERE item_type = 'event'
  AND event_message IS NOT NULL
  AND received_at >= to_unixtime(current_timestamp - interval '7' day)
GROUP BY event_message, event_environment, event_release
ORDER BY occurrence_count DESC
LIMIT 100;

-- Release Analysis
SELECT
  event_release,
  event_environment,
  sentry_project_id,
  COUNT(*) as event_count,
  COUNT(DISTINCT event_user_id) as user_count,
  COUNT(DISTINCT event_message) as unique_errors,
  SUM(item_length_bytes) / 1024 / 1024.0 as total_mb,
  MIN(from_unixtime(received_at)) as first_event,
  MAX(from_unixtime(received_at)) as last_event,
  date_diff('hour', MIN(from_unixtime(received_at)), MAX(from_unixtime(received_at))) as release_age_hours
FROM r2.default.issue_manifests
WHERE event_release IS NOT NULL
  AND received_at >= to_unixtime(current_timestamp - interval '30' day)
GROUP BY event_release, event_environment, sentry_project_id
ORDER BY first_event DESC;

-- Hourly Pattern Analysis
SELECT
  HOUR(from_unixtime(received_at)) as hour_of_day,
  DAY_OF_WEEK(from_unixtime(received_at)) as day_of_week,
  item_type,
  COUNT(*) as event_count,
  AVG(item_length_bytes) as avg_size_bytes,
  COUNT(DISTINCT event_user_id) as unique_users
FROM r2.default.issue_manifests
WHERE received_at >= to_unixtime(current_timestamp - interval '30' day)
GROUP BY hour_of_day, day_of_week, item_type
ORDER BY day_of_week, hour_of_day;

-- Data Volume by Project
SELECT
  sentry_project_id,
  date_trunc('day', from_unixtime(received_at)) as date,
  item_type,
  COUNT(*) as event_count,
  SUM(item_length_bytes) / 1024 / 1024.0 as total_mb,
  AVG(item_length_bytes) as avg_bytes,
  MIN(item_length_bytes) as min_bytes,
  MAX(item_length_bytes) as max_bytes,
  APPROX_PERCENTILE(item_length_bytes, 0.95) as p95_bytes
FROM r2.default.issue_manifests
WHERE received_at >= to_unixtime(current_timestamp - interval '90' day)
GROUP BY sentry_project_id, date, item_type
ORDER BY date DESC, total_mb DESC;

-- User Impact Analysis
SELECT
  event_user_id,
  event_environment,
  COUNT(*) as error_count,
  COUNT(DISTINCT event_message) as unique_errors,
  COUNT(DISTINCT event_release) as affected_releases,
  MIN(from_unixtime(received_at)) as first_error,
  MAX(from_unixtime(received_at)) as last_error,
  date_diff('hour', MIN(from_unixtime(received_at)), MAX(from_unixtime(received_at))) as error_span_hours
FROM r2.default.issue_manifests
WHERE event_user_id IS NOT NULL
  AND item_type = 'event'
  AND received_at >= to_unixtime(current_timestamp - interval '7' day)
GROUP BY event_user_id, event_environment
HAVING error_count > 1
ORDER BY error_count DESC
LIMIT 500;

-- Environment Comparison
SELECT
  event_environment,
  item_type,
  date_trunc('hour', from_unixtime(received_at)) as time_bucket,
  COUNT(*) as event_count,
  COUNT(DISTINCT event_message) as unique_errors,
  COUNT(DISTINCT event_user_id) as affected_users,
  AVG(item_length_bytes) / 1024.0 as avg_size_kb,
  SUM(item_length_bytes) / 1024 / 1024.0 as total_mb
FROM r2.default.issue_manifests
WHERE received_at >= to_unixtime(current_timestamp - interval '7' day)
  AND event_environment IS NOT NULL
GROUP BY event_environment, item_type, time_bucket
ORDER BY time_bucket DESC;

-- Real-time Event Stream (Last Hour)
SELECT
  from_unixtime(received_at) as received_time,
  item_type,
  event_message,
  event_environment,
  event_release,
  event_user_id,
  sdk_name,
  sdk_version,
  sentry_project_id,
  item_length_bytes / 1024.0 as size_kb,
  sent_at_drift_ms / 1000.0 as drift_seconds
FROM r2.default.issue_manifests
WHERE received_at >= to_unixtime(current_timestamp - interval '1' hour)
ORDER BY received_at DESC
LIMIT 1000;
```
