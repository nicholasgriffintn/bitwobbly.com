# Setup Guide (Cloudflare resources)

This project expects these resources:

## 1) D1 Database

Create:

- name: `bitwobbly_db`

Apply migrations:

```bash
pnpm -C apps/app-worker db:migrate:remote
```

Update `database_id` in each `wrangler.jsonc` (app/scheduler/checker/notifier).

## 2) KV Namespace

Create a KV namespace (e.g. `bitwobbly_kv`) and set its ID into:

- `apps/app-worker/wrangler.jsonc` (binding `KV`)

KV is used for public status snapshots: key pattern `status:<slug>`.

## 3) Queues

Create two queues:

- `bitwobbly_check_jobs`
- `bitwobbly_alert_jobs`

Ensure:

- Scheduler produces to `bitwobbly_check_jobs`
- Checker consumes `bitwobbly_check_jobs`, produces to `bitwobbly_alert_jobs`
- Notifier consumes `bitwobbly_alert_jobs`
- App worker has producer binding for `ALERT_JOBS` (manual or future use)

## 4) Durable Objects

The incident coordinator is implemented and hosted by the **Checker Worker** as a Durable Object class `IncidentCoordinator`.
This DO updates D1 incidents and rebuilds status snapshots into KV.

## 5) Admin token

Set a secret for the App Worker (used to authorise API writes after login):

```bash
cd apps/app-worker
wrangler secret put ADMIN_API_TOKEN
```

The dashboard stores the returned token in localStorage to call write APIs.

## 6) Admin username + password

Set fixed credentials for now:

```bash
cd apps/app-worker
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD
```

## 6) Optional: Add a webhook notification channel/policy

Because this starter kit does not yet have UI for notifications, add rows directly in D1.

Example (replace URL and monitor_id):

```sql
INSERT INTO notification_channels (id, team_id, type, config_json, enabled, created_at)
VALUES ('chan_webhook_1', 'team_demo', 'webhook', '{"url":"https://example.com/webhook"}', 1, datetime('now'));

INSERT INTO notification_policies (id, team_id, monitor_id, channel_id, threshold_failures, notify_on_recovery, created_at)
VALUES ('pol_1', 'team_demo', '<MONITOR_ID>', 'chan_webhook_1', 3, 1, datetime('now'));
```
