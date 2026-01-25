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

The queues should be automatically created on the first deployment, but you can also create them manually:

- `bitwobbly-check-jobs`
- `bitwobbly-alert_-obs`

Ensure:

- Scheduler produces to `bitwobbly-check-jobs`
- Checker consumes `bitwobbly-check-jobs`, produces to `bitwobbly-alert_-obs`
- Notifier consumes `bitwobbly-alert_-obs`
- App worker has producer binding for `ALERT_JOBS` (manual or future use)

## 4) Durable Objects

The incident coordinator is implemented and hosted by the **Checker Worker** as a Durable Object class `IncidentCoordinator`.

This DO updates D1 incidents and rebuilds status snapshots into KV.

This will be automatically created on first deployment.
