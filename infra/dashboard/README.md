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

And then run SQL queries against the R2 catalog:

```sql
-- Show all schemas in the R2 catalog
SHOW SCHEMAS IN r2;

-- View all columns and data structure
SELECT *
FROM r2.default.issue_manifests
LIMIT 10;

-- Count total events
SELECT COUNT(*)
FROM r2.default.issue_manifests;

-- Count events by type
SELECT item_type, COUNT(*) as count
FROM r2.default.issue_manifests
GROUP BY item_type;

-- SDK distribution with version details
SELECT
  sdk_name,
  sdk_version,
  COUNT(*) as event_count,
  SUM(item_length_bytes) / 1024 / 1024 as total_mb
FROM r2.default.issue_manifests
WHERE item_type = 'event'
GROUP BY sdk_name, sdk_version
ORDER BY event_count DESC
LIMIT 20;

-- Clock drift analysis by SDK
SELECT
  sdk_name,
  AVG(sent_at_drift_ms) / 1000.0 as avg_drift_seconds,
  MAX(sent_at_drift_ms) / 1000.0 as max_drift_seconds,
  MIN(sent_at_drift_ms) / 1000.0 as min_drift_seconds,
  COUNT(*) as sample_count
FROM r2.default.issue_manifests
WHERE sent_at IS NOT NULL
  AND sent_at_drift_ms IS NOT NULL
GROUP BY sdk_name
ORDER BY avg_drift_seconds DESC;

-- Top error messages for a project
SELECT
  event_message,
  COUNT(*) as occurrence_count,
  MIN(received_at) as first_seen,
  MAX(received_at) as last_seen
FROM r2.default.issue_manifests
WHERE sentry_project_id = 123
  AND item_type = 'event'
  AND event_message IS NOT NULL
GROUP BY event_message
ORDER BY occurrence_count DESC
LIMIT 50;

-- Error rate by release and environment
SELECT
  event_release,
  event_environment,
  COUNT(*) as error_count,
  COUNT(DISTINCT event_user_id) as affected_users
FROM r2.default.issue_manifests
WHERE sentry_project_id = 123
  AND item_type = 'event'
  AND event_release IS NOT NULL
  AND received_at >= 1704067200
GROUP BY event_release, event_environment
ORDER BY error_count DESC;

-- Hourly event pattern analysis
SELECT
  HOUR(from_unixtime(received_at)) as hour_of_day,
  COUNT(*) as event_count,
  AVG(item_length_bytes) as avg_size_bytes
FROM r2.default.issue_manifests
WHERE received_at >= to_unixtime(current_timestamp - interval '7' day)
GROUP BY HOUR(from_unixtime(received_at))
ORDER BY hour_of_day;

-- Top contributors by data volume
SELECT
  sdk_name,
  event_release,
  COUNT(*) as event_count,
  SUM(item_length_bytes) / 1024 / 1024 as total_mb,
  AVG(item_length_bytes) as avg_bytes
FROM r2.default.issue_manifests
WHERE received_at >= to_unixtime(current_timestamp - interval '1' day)
GROUP BY sdk_name, event_release
ORDER BY total_mb DESC
LIMIT 20;
```
