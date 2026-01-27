# Bit Wobbly

Open-source website monitoring and public status pages, built entirely on Cloudflare Workers.

> Please Note: This project is in early development and not yet production-ready. Use at your own risk. The plan to get this into production can be seen below.

## Plan of Completion

### Incomplete Features

- **R2 API is a bit slow** -- Look for ways that we can make the frontend seem faster and also, potentially cache, although the analytics in issues are dug quite deep at the moment so not used often.
- **Session cleanup** -- The `sessions` table has an `expires_at` column but no scheduled cleanup or validation logic runs against it.
- **Email verification** -- No email verification flow exists. Users can sign up with any email and start using the system immediately. Cognito supports this but custom does not.
- **Password reset** -- No password reset flow exists. Users cannot recover access if they forget their password. Both cognito and custom auth are affected. Cognito supports this but custom does not.
- **MFA support** -- No multi-factor authentication options for user accounts. Cognito supports this but custom does not.

### Missing Integrations

- **Configure notifications for issues** -- We don't trigger notifications on issues from the issue tracking integration yet.

### Nice-to-Haves

- **Add private and internal status pages** -- Support for private status pages (protected by basic auth or login) and internal status pages (only visible to logged-in users).
- **Add other integrations to trigger notifications** -- Support for more integrations that can trigger alarms such as increased views on the status pages or other systems externally.
- **Monitor response validation** -- Only HTTP status is checked. Body content matching, certificate expiry checks, and DNS monitoring would add value.
- **API keys** -- No programmatic API access for users (settings page placeholder exists).
- **Add more notification channels** -- Support for SMS, Slack, PagerDuty, etc. Maybe a bit of AI calling for incident response?


## Architecture

Multiple Workers collaborate via Cloudflare Queues, Durable Objects, and Pipelines:

```
Scheduler (cron, every 1 min)
  → bitwobbly-check-jobs queue
    → Checker Worker (performs HTTP checks, manages incidents via Durable Object)
      → bitwobbly-alert-jobs queue
        → Notifier Worker (sends webhooks / emails via Resend)

App Worker (React dashboard + REST API)
  → Serves the UI, handles auth, CRUD for monitors/status pages/notifications/issue tracking
  → Public status page snapshots cached in KV

Sentry Ingest Worker (SDK-compatible issue ingestion)
  → Receives Sentry SDK envelopes
  → Stores raw payloads in R2, writes manifests to Pipelines
  → bitwobbly-sentry-events queue
    → Sentry Processor Worker (event grouping and fingerprinting)
      → Groups events into issues, writes to D1
```

### Apps

| App                            | Purpose                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/app-worker`              | React 19 dashboard + API. Manages monitors, status pages, notification channels, issue tracking projects, and auth.                      |
| `apps/scheduler-worker`        | Cron-triggered dispatcher. Finds due monitors and enqueues check jobs.                                                                   |
| `apps/checker-worker`          | Queue consumer. Performs HTTP checks, tracks failures, opens/resolves incidents via Durable Objects, writes metrics to Analytics Engine. |
| `apps/notifier-worker`         | Queue consumer. Delivers alerts via webhooks and email (Resend API).                                                                     |
| `apps/sentry-ingest-worker`    | Sentry SDK-compatible ingestion endpoint. Parses envelopes, stores raw payloads in R2, publishes to Pipelines and queue.                 |
| `apps/sentry-processor-worker` | Queue consumer. Extracts events from R2, computes fingerprints, groups into issues, writes to D1.                                        |

### Packages

| Package           | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `packages/shared` | Drizzle ORM schema (16 tables), database factory, utility functions. |

### External Services

- **Cloudflare D1** -- SQLite database
- **Cloudflare KV** -- status page snapshot cache
- **Cloudflare R2** -- raw Sentry envelope storage
- **Cloudflare Queues** -- job dispatch between workers
- **Cloudflare Pipelines** -- durable ingestion buffering and SQL transformation
- **Cloudflare Durable Objects** -- incident coordination state
- **Cloudflare Analytics Engine** -- latency/uptime metrics
- **Resend** -- transactional email delivery

## Local Development

### Prerequisites

- Node.js (ES2022+)
- pnpm 10.27.0 (`corepack enable && corepack prepare pnpm@10.27.0`)
- A Cloudflare account (free tier works for dev)

### Setup

```bash
# Install dependencies
pnpm install

# Run database migrations locally
pnpm --filter @bitwobbly/app-worker db:migrate:local

# Start all workers (each in a separate terminal)
pnpm -C apps/app-worker dev
pnpm -C apps/scheduler-worker dev
pnpm -C apps/checker-worker dev
pnpm -C apps/notifier-worker dev
pnpm -C apps/sentry-ingest-worker dev
pnpm -C apps/sentry-processor-worker dev
```

The app worker serves the dashboard at `http://localhost:5173`. API routes are under `/api/*`.

Local dev uses Wrangler's simulator for D1, KV, Queues, and Durable Objects. All workers share the same persistent state in `/.data` at the workspace root.

**Note:** Cron triggers don't auto-run locally. To test monitors, use the "Check Now" button in the UI or run:

```bash
curl "http://localhost:8788/cdn-cgi/handler/scheduled"
```

### Environment Variables

Create `apps/app-worker/.dev.vars`:

For email notifications locally, add `RESEND_API_KEY` to `apps/notifier-worker/.dev.vars`.

### Scripts

| Command              | Scope | Description                                  |
| -------------------- | ----- | -------------------------------------------- |
| `pnpm install`       | Root  | Install all workspace dependencies           |
| `pnpm lint`          | All   | Run linting across all packages              |
| `pnpm lint:monorepo` | Root  | Check monorepo constraints (sherif)          |
| `pnpm typecheck`     | All   | TypeScript type checking across all packages |

## Deployment

All workers deploy to Cloudflare via Wrangler. See [docs/SETUP.md](docs/SETUP.md) for full resource provisioning steps.

### Quick Deploy

1. **Create Cloudflare resources:**
   - D1 database: `bitwobbly_db`
   - KV namespace: `bitwobbly_kv`
   - R2 buckets: `bitwobbly-issues-raw`, `bitwobbly-issues-catalog`
   - Queues: `bitwobbly-check-jobs`, `bitwobbly-alert-jobs`, `bitwobbly-sentry-events`
   - Pipelines: `bitwobbly-issues-pipeline` (with R2 Data Catalog sink)

2. **Update `wrangler.jsonc`** in each app with your resource IDs (replace `REPLACE_ME` values).

3. **Set secrets:**

   ```bash
   cd ../notifier-worker
   wrangler secret put RESEND_API_KEY
   ```

4. **Apply migrations remotely:**

   ```bash
   pnpm -C apps/app-worker db:migrate:remote
   ```

5. **Deploy each worker:**
   ```bash
   pnpm -C apps/app-worker run deploy
   pnpm -C apps/scheduler-worker run deploy
   pnpm -C apps/checker-worker run deploy
   pnpm -C apps/notifier-worker run deploy
   pnpm -C apps/sentry-ingest-worker run deploy
   pnpm -C apps/sentry-processor-worker run deploy
   ```

The app worker is configured to serve from `bitwobbly.com` via custom domain. Update the `routes` in `apps/app-worker/wrangler.jsonc` for your own domain.
