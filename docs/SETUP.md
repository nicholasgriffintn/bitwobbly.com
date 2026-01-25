# Setup Guide (Cloudflare resources)

This project expects these resources:

## 1) D1 Database

Create:

- name: `bitwobbly_db`

Update `database_id` in each `wrangler.jsonc` (app/scheduler/checker/notifier).

Apply migrations:

```bash
pnpm -C apps/app-worker db:migrate:remote
```

## 2) KV Namespace

Create a KV namespace (e.g. `bitwobbly_kv`) and set its ID into:

- `apps/app-worker/wrangler.jsonc` (binding `KV`)

KV is used for public status snapshots: key pattern `status:<slug>`.

## 3) Queues

Create two queues:

- `bitwobbly-check-jobs`
- `bitwobbly-alert-jobs`

Ensure:

- Scheduler produces to `bitwobbly-check-jobs`
- Checker consumes `bitwobbly-check-jobs`, produces to `bitwobbly-alert-jobs`
- Notifier consumes `bitwobbly-alert-jobs`
- App worker has producer binding for `ALERT_JOBS` (manual or future use)

## 4) Durable Objects

The incident coordinator is implemented and hosted by the **Checker Worker** as a Durable Object class `IncidentCoordinator`.

This DO updates D1 incidents and rebuilds status snapshots into KV.

This will be automatically created on first deployment.

## 5) Analytics Engine

- name: `bitwobbly-monitor-analytics`

The Checker Worker writes check results (latency, status) to this dataset.
The App Worker queries it for monitor metrics and uptime charts.

The dataset will be created automatically on first deployment.

## 6) Deploy the apps

Deploy each app with:

```bash
pnpm -C apps/app-worker deploy
pnpm -C apps/scheduler-worker deploy
pnpm -C apps/checker-worker deploy
pnpm -C apps/notifier-worker deploy
```

## 7) Set up environment variables

Set up any required environment variables in the Cloudflare dashboard for each worker.

Refer to the `.env.example` files in each app for guidance on which variables are needed.

## 9) Setup the sentry issues pipelines

### Create the R2 Buckets

First we need to create the R2 buckets that will be used to store the raw envelopes and the data catalog.

These should be named `bitwobbly-sentry-raw` and `bitwobbly-sentry-catalog`.

You can do this by running the following commands:

```bash
wrangler r2 bucket create bitwobbly-sentry-raw
wrangler r2 bucket create bitwobbly-sentry-catalog
```

### Create the Pipelines Stream

Next we need to create the Pipelines stream that will be used to store the raw envelopes.

This should be named `bitwobbly_sentry_manifests`.

You can do this by running the following command:

```bash
wrangler pipelines create bitwobbly_sentry_manifests --type unstructured
```

### Configure the R2 Data Catalog Sink

Next we need to configure the R2 Data Catalog sink that will be used to store the raw envelopes.

This should be named `bitwobbly-sentry-sink`.

You can do this by running the following command:

```bash
wrangler pipelines sink create bitwobbly-sentry-sink --pipeline bitwobbly-sentry-manifests --type r2-data-catalog --bucket bitwobbly-sentry-catalog --table sentry_manifests
```
