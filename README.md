# Bit Wobbly

Open-source website monitoring and public status pages, built entirely on Cloudflare Workers.

## Architecture

Four Workers collaborate via Cloudflare Queues and Durable Objects:

```
Scheduler (cron, every 1 min)
  → bitwobbly-check-jobs queue
    → Checker Worker (performs HTTP checks, manages incidents via Durable Object)
      → bitwobbly-alert-jobs queue
        → Notifier Worker (sends webhooks / emails via Resend)

App Worker (React dashboard + REST API)
  → Serves the UI, handles auth, CRUD for monitors/status pages/notifications
  → Public status page snapshots cached in KV
```

### Apps

| App                     | Purpose                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/app-worker`       | React 19 dashboard + API. Manages monitors, status pages, notification channels, and auth.                                               |
| `apps/scheduler-worker` | Cron-triggered dispatcher. Finds due monitors and enqueues check jobs.                                                                   |
| `apps/checker-worker`   | Queue consumer. Performs HTTP checks, tracks failures, opens/resolves incidents via Durable Objects, writes metrics to Analytics Engine. |
| `apps/notifier-worker`  | Queue consumer. Delivers alerts via webhooks and email (Resend API).                                                                     |

### Packages

| Package           | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `packages/shared` | Drizzle ORM schema (12 tables), database factory, utility functions. |

### External Services

- **Cloudflare D1** -- SQLite database
- **Cloudflare KV** -- status page snapshot cache
- **Cloudflare Queues** -- job dispatch between workers
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
   - Queues: `bitwobbly-check-jobs`, `bitwobbly-alert-jobs`

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
   ```

The app worker is configured to serve from `bitwobbly.com` via custom domain. Update the `routes` in `apps/app-worker/wrangler.jsonc` for your own domain.

## Plan of Completion

### Blocking Issues

- **Resource ID placeholders** -- All `wrangler.jsonc` files contain `REPLACE_ME` for D1 database IDs and KV namespace IDs. These must be filled before any deployment.
- **Analytics Engine SQL injection risk** -- The metrics query in `apps/checker-worker/src/repositories/metrics.ts` uses string interpolation (`WHERE blob1 = '${monitorId}'`) rather than parameterised queries. Needs sanitisation or a query builder.
- **No CI/CD pipeline** -- No GitHub Actions or deployment automation exists. Workers must be deployed manually via Wrangler CLI.

### Incomplete Features

- **Session cleanup** -- The `sessions` table has an `expires_at` column but no scheduled cleanup or validation logic runs against it.

### Missing Integrations

- **Multi-tenant auth** -- Currently single-team (`team_demo`) with invite code. No user invite flow or team management UI, also need to ability to remove users from the demo team.
- **Rate limiting** -- API endpoints have no rate limiting. Exposed public status page endpoints could be abused.
- **SMS/Slack/PagerDuty channels** -- Only webhook and email are implemented. Common integrations like Slack, SMS, and PagerDuty are missing.
- **Backup strategy** -- No D1 export/backup automation documented.
- **Monitoring/observability** -- No structured logging, tracing, or alerting on the workers themselves (beyond Cloudflare's built-in dashboard).
- **Manually trigger checks** -- No API endpoint or CLI command to manually trigger monitor checks outside of the scheduler cron.

### Nice-to-Haves

- **Configurable email sender** -- Currently hardcoded to `bitwobbly@notifications.nicholasgriffin.dev`.
- **Monitor response validation** -- Only HTTP status is checked. Body content matching, certificate expiry checks, and DNS monitoring would add value.
- **Historical uptime reporting** -- Analytics Engine data exists but the dashboard doesn't surface historical uptime percentages or SLA calculations.
- **Public status page theming** -- Schema fields exist but no theme editor or preview in the dashboard.
- **API keys** -- No programmatic API access for users (settings page placeholder exists).
