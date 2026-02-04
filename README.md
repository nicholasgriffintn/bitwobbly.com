# Bit Wobbly

Open-source website monitoring and public status pages, built entirely on Cloudflare Workers.

> Please Note: This project is in early development and not yet production-ready. Use at your own risk. The plan to get this into production can be seen below.

## Plan of Completion

#### Monitoring

- [ ] Potentially add Ping (ICMP) checks if not too complex to implement in Workers.
- [ ] Implement browser checks with https://developers.cloudflare.com/browser-rendering/, potentially even https://developers.cloudflare.com/browser-rendering/stagehand/.

#### Issues

- [ ] Persist and query sessions/client reports; expose crash-free session and release health views.
- [ ] Improve grouping with stacktrace-based fingerprinting rules, frame normalisation, and configurable overrides.
- [ ] Track issue ownership and workflow (`assigned`, `snoozed`, `ignored until`, `resolved in release`, `regressed`).
- [ ] Add source maps and symbolication pipeline with secure upload endpoints and retention controls.
- [ ] Add search and faceting over tags, release, environment, user, transaction, and time windows.
- [ ] Add performance primitives: transaction summaries, Apdex-style score, and slow span hotspots.
- [ ] Add incident lifecycle controls: templates, severity, impact scope, timeline editing, postmortems, and RCA links.

### Potential expansions

- Integrate with Cloudflare tail workers or just using OTEL, decide on the best option. Ingest into issues.
- Add channels: Slack, PagerDuty, Opsgenie, Teams, SMS, voice, and generic webhook signatures.
- Add advanced alert conditions: anomaly bands, error budget burn, crash-free drop, composite multi-signal rules.
- Add rule simulation and preview against historical data before enabling.
- Add on-call routing, escalation policies, and acknowledgement workflows.
- Add automation hooks for incident creation, enrichment, and post-incident follow-up tasks.
- Add retention policies and tiered storage lifecycle (hot D1, warm R2, archival exports).
- Add indexing and query optimisation for large issue/event volumes; benchmark queue and storage throughput.
- Add backups and disaster recovery drills for D1, KV, and R2.
- Add compliance controls (PII scrubbing, data residency options, audit event stream).
- Add billing and quota controls (event volume limits, monitor limits, alert overage handling) which will make it available for SaaS applications.

## Architecture

Multiple Workers collaborate via Cloudflare Queues, Durable Objects, and Pipelines:

```mermaid
flowchart TD
  Scheduler["Scheduler (cron, every 1 min)"] --> CheckQueue["bitwobbly-check-jobs queue"]
  CheckQueue --> Checker["Checker Worker<br/>HTTP checks + incident management (Durable Object)"]
  Checker --> AlertQueue["bitwobbly-alert-jobs queue"]
  AlertQueue --> Notifier["Notifier Worker<br/>Webhooks / email (Resend)"]

  App["App Worker (React dashboard + REST API)"] --> AppTasks["UI, auth, CRUD for monitors/status pages/notifications/issues"]
  App --> KV["Public status page snapshots cached in KV"]

  Ingest["Sentry Ingest Worker (SDK-compatible issue ingestion)"] --> Envelopes["Receives Sentry SDK envelopes"]
  Ingest --> Storage["Stores raw payloads in R2 + writes manifests to Pipelines"]
  Ingest --> SentryQueue["bitwobbly-sentry-events queue"]
  SentryQueue --> Processor["Sentry Processor Worker<br/>event grouping + fingerprinting"]
  Processor --> D1["Groups events into issues, writes to D1"]
```

### Apps

| App                            | Purpose                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/app-worker`              | React dashboard + API. Manages monitors, status pages, notification channels, issue tracking projects, and auth.                      |
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

- Node.js 24+
- pnpm 10.27.0 (`corepack enable && corepack prepare pnpm@10.27.0`)

### Quick Start

```bash
pnpm install
pnpm db:migrate:local
pnpm dev
```

This runs all core workers concurrently via Turbo. The dashboard is at `http://localhost:5173`.

### Running Individual Workers

```bash
pnpm dev:app              # Dashboard + API (port 5173)
pnpm dev:scheduler        # Cron dispatcher (port 8788)
pnpm dev:checker          # HTTP checks (port 8787)
pnpm dev:notifier         # Email/webhook alerts
pnpm dev:sentry-ingest    # Sentry SDK ingestion
pnpm dev:sentry-processor # Event grouping
```

### Local State

Wrangler's simulator handles D1, KV, Queues, and Durable Objects locally. State persists in `.data/` at the workspace root.

Cron triggers don't auto-run locally. Test monitors via the "Check Now" button or:

```bash
curl "http://localhost:8788/cdn-cgi/handler/scheduled"
```

### Environment Variables

For email notifications, create `apps/notifier-worker/.dev.vars`:

```
RESEND_API_KEY=re_xxxxx
```

## Deployment

All workers deploy to Cloudflare via Wrangler. See [docs/SETUP.md](docs/SETUP.md) for full resource provisioning steps.
