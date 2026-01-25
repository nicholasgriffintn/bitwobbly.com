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
- **No CI/CD pipeline** -- No GitHub Actions or deployment automation exists. Workers must be deployed manually via Wrangler CLI.

### Incomplete Features

- **Session cleanup** -- The `sessions` table has an `expires_at` column but no scheduled cleanup or validation logic runs against it.
- **Analytics Engine integration** -- The Checker Worker writes check results (latency, status) to the Analytics Engine dataset. The App Worker queries it for monitor metrics and uptime charts. This is not fully implemented / relised yet to produce graphs that are useful to users, it's just a base level at the moment. The queries need to be removed. This is likely more of a problem for the histories on the status pages.
- **Email verification** -- No email verification flow exists. Users can sign up with any email and start using the system immediately.
- **Password reset** -- No password reset flow exists. Users cannot recover access if they forget their password.
- **API security** -- We aren't validating that the user owns the resources they are modifying in all API endpoints.

### Missing Integrations

- **Create/Join/Manage teams** -- Need to be able to configure teams from settings.
- **MFA support** -- No multi-factor authentication options for user accounts.
- **Rate limiting** -- API endpoints have no rate limiting. Exposed public status page endpoints could be abused.
- **SMS/Slack/PagerDuty channels** -- Only webhook and email are implemented. Common integrations like Slack, SMS, and PagerDuty are missing.
- **Manually trigger checks** -- No API endpoint or CLI command to manually trigger monitor checks outside of the scheduler cron.

### Nice-to-Haves

- **Monitor response validation** -- Only HTTP status is checked. Body content matching, certificate expiry checks, and DNS monitoring would add value.
- **API keys** -- No programmatic API access for users (settings page placeholder exists).
- **Add Sentry compatible issue tracking**

```
Below is a plan that keeps **querying and management inside your existing `apps/app-worker`** (as you requested), while introducing a dedicated **Sentry ingest Worker** whose only job is to be “SDK-compatible on the wire” and feed Cloudflare Pipelines + R2.

This aligns with your current BitWobbly architecture where the **app worker serves the React dashboard + REST API**, and other workers do specialized jobs via queues/DOs. ([GitHub][1])

---

## 1) Target architecture

### Components you will add

1. **New worker: `apps/sentry-ingest-worker`**

* Exposes a Sentry-compatible endpoint: `POST /api/:project_id/envelope/`
* Authenticates DSNs (public key + project id) against data stored in D1 (owned by app-worker)
* Writes the raw envelope bytes to R2
* Emits compact JSON “manifest” records into a **Pipelines stream** using a Worker binding (`send(records)`)

Why a separate worker: Sentry ingest traffic has very different characteristics (high volume, bursty, large/binary payloads, tight latency). Keeping it isolated avoids impacting your dashboard/API and lets you scale and rate-limit independently.

2. **Pipelines: stream + pipeline + R2 Data Catalog sink**

* Stream: durable ingestion buffer (“durable, buffered queue”) ([Cloudflare Docs][2])
* Pipeline: SQL transformation from stream to sink ([Cloudflare Docs][3])
* Sink: **R2 Data Catalog** writing **Iceberg tables** into R2 ([Cloudflare Docs][4])

3. **Existing worker extended: `apps/app-worker`**

* Adds “Sentry replacement API” endpoints for:

  * DSN/project management (create projects, rotate keys, quotas)
  * Query endpoints (list issues/events/transactions/sessions/replays)
  * UI pages/components inside your existing React dashboard

This matches your current division of responsibilities: app worker = dashboard + REST API. ([GitHub][1])

---

## 2) Data flow

### Ingestion path (SDK → your system)

1. **Sentry SDK posts an Envelope** to:

* `POST https://<your-ingest-host>/api/:project_id/envelope/` ([Sentry][5])

2. `sentry-ingest-worker`:

* validates DSN/public key → finds project config in D1 (read-only)
* stores raw envelope bytes into R2 (source of truth)
* parses minimally to produce *manifest records* (JSON) per item
* publishes those JSON records to a Pipelines stream via Worker binding (`send(records)`), which is the recommended secure approach (no tokens). ([Cloudflare Docs][6])

3. Pipelines:

* receives manifest records from the stream
* transforms (SQL) → writes Iceberg tables into R2 Data Catalog ([Cloudflare Docs][4])

### Query path (your dashboard/API → data)

* `apps/app-worker` queries the Iceberg tables (via R2 SQL or your own query service) for fast list/filter operations, and reads raw payloads from R2 for drill-down details.
* Optional: maintain small “hot indices” in D1 for very fast recent queries and auth checks, but treat the lakehouse as the analytical source.

---

## 3) What “full SDK compatible” means here (scope definition)

To be robust across Sentry SDKs, you must:

* Implement **only** the Envelope endpoint (no legacy `/store/`). ([Sentry][5])
* Be **tolerant** of item types and schema drift: accept unknown item types, store them, and do not 400 unless the envelope is malformed.
* Support binary-safe ingestion (replays/attachments can include non-UTF8 data; you should treat envelope payload sections as bytes, not strings). This is a known footgun if you do naive UTF-8 parsing. ([GitHub][7])

Practically, “full SDK compatible ingest” = **no client-side ingestion errors** for mainstream SDKs when pointed at your DSN, even if you don’t yet have feature-parity UI for every item type.

---

## 4) Concrete implementation plan

### Phase A — Storage & Pipelines foundation (1–2 days)

1. **Create R2 buckets**

* `sentry-raw` (raw envelopes + extracted payload blobs)
* `sentry-catalog` (or reuse one bucket) with **R2 Data Catalog enabled** for Iceberg ([Cloudflare Docs][8])

2. **Create Pipelines stream**

* Start **unstructured** stream to avoid schema validation drops while you iterate. (Structured streams will accept but drop invalid rows if schema mismatches.) ([Cloudflare Docs][6])

3. **Create Pipelines sink (R2 Data Catalog)**

* Iceberg table: `sentry_manifests` ([Cloudflare Docs][4])

4. **Create pipeline SQL**

* Minimal: write-through of stream `value` with partition columns extracted (project_id, item_type, received_date)

You can do all of the above via Wrangler commands; Pipelines supports CLI-driven setup. ([Cloudflare Docs][9])

---

### Phase B — D1 schema extensions (0.5–1.5 days)

Extend `packages/shared` Drizzle schema (your repo already centralizes schema there). ([GitHub][1])

Add tables (minimum):

* `sentry_projects`

  * `id` (internal UUID/ULID)
  * `workspace_id` (ties into BitWobbly auth model)
  * `sentry_project_id` (the numeric path id used in `/api/:project_id/envelope/`)
  * `name`, `created_at`
* `sentry_keys`

  * `project_id` (FK)
  * `public_key` (SDK-facing)
  * `secret_key` (optional; if you want server-side authenticated operations)
  * `status`, `created_at`, `revoked_at`
  * quota/rate-limit config
* `sentry_client_config`

  * default sampling, allowed origins, max payload bytes, etc.

Add a small, fast lookup index:

* unique(project_id, public_key)
* unique(sentry_project_id, public_key)

---

### Phase C — `apps/sentry-ingest-worker` (core ingest) (5–15 days)

1. **Routing**

* Only implement: `POST /api/:project_id/envelope/`

2. **Auth**

* Parse DSN public key from header/query (SDKs vary)
* Lookup `{sentry_project_id, public_key}` in D1
* Enforce quotas/rate-limits; return `429` when exceeded

3. **Binary-safe envelope handling**

* Read request body as bytes/stream, not UTF-8 strings (avoid replay/attachment breakage) ([GitHub][7])
* Persist raw envelope to R2:

  * keying pattern: `raw/{sentry_project_id}/{yyyy}/{mm}/{dd}/{ulid}.envelope`

4. **Manifest generation**
   You do not need to fully normalize in the ingest path. Parse just enough to create per-item manifests:

Fields to include (recommended):

* `manifest_id` (ULID)
* `sentry_project_id`
* `received_at`
* `envelope_id` (from header if present, else ULID)
* `item_type` (event/transaction/session/attachment/replay/unknown)
* `event_id` (if present in item payload)
* `trace_id`, `span_id` (if present)
* `r2_raw_key`
* `item_index`, `item_length_bytes`
* `sdk_name`, `sdk_version` (if present)

5. **Publish manifests to Pipelines stream**

* Add Pipelines binding in `wrangler.jsonc`
* Use Worker binding `send(records)` to write to the stream ([Cloudflare Docs][6])

6. **Operational hardening**

* Return `200` once raw stored + manifest enqueued (do not block on downstream)
* Add structured logs and metrics (you already use Analytics Engine in the project; decide whether you want ingest metrics there too) ([GitHub][1])

---

### Phase D — Expand `apps/app-worker` with Sentry management + query API (7–20 days)

This is the part you explicitly asked for: implement “the API” in the current app worker.

#### D.1 Project + DSN management endpoints

Add routes under your existing `/api/*` convention. ([GitHub][1])

Recommended endpoints:

* `POST /api/sentry/projects` (create project + generate DSN)
* `GET /api/sentry/projects` (list)
* `POST /api/sentry/projects/:id/keys` (rotate key)
* `PATCH /api/sentry/projects/:id/settings` (sampling, limits)
* `GET /api/sentry/projects/:id/dsn` (display DSN)

#### D.2 Query endpoints (read path)

Start with “Sentry-like” primitives:

* `GET /api/sentry/projects/:id/events?since=&until=&level=&release=&env=`
* `GET /api/sentry/projects/:id/transactions?since=&until=&name=`
* `GET /api/sentry/events/:event_id` (fetch raw payload via R2 key)
* `GET /api/sentry/issues?since=&until=` (once grouping exists)
* `GET /api/sentry/replays?since=&until=` (initially list-only)

Implementation detail:

* list endpoints query Iceberg tables written by Pipelines (fast filtering by partition columns).
* detail endpoints fetch raw envelope from R2 and extract the relevant item.

Cloudflare’s Pipelines + R2 Data Catalog approach is explicitly designed for queryable Iceberg tables. ([Cloudflare Docs][4])

#### D.3 UI integration (optional but typical)

* Add a “Sentry” section in the dashboard:

  * Projects
  * Events
  * Transactions
  * Sessions
  * Replays (if you want)

---

### Phase E — Grouping, issues, and “Sentry-like” semantics (variable: weeks to months)

If by “full Sentry setup” you mean the *product behavior* (issues, grouping, alerts), you’ll need additional processing beyond Pipelines SQL.

Recommended approach:

* Keep Pipelines for durable ingestion + lakehouse tables
* Add a **processor** (Queue consumer worker or scheduled job) for:

  * fingerprint computation + grouping
  * issue lifecycle (new/regression/resolved)
  * transaction aggregates (p50/p95)
  * session health rollups

This mirrors your existing pattern: checker/notifier workers do specialized async work; the app worker serves UI/API. ([GitHub][1])

---

## 5) Repo-level changes (explicit)

### New app

* `apps/sentry-ingest-worker`

  * `src/index.ts` (routing, auth, R2 write, manifest publish)
  * `wrangler.jsonc` (bindings: D1 read, R2, pipelines stream)

### Modified existing app

* `apps/app-worker`

  * new API routes under `/api/sentry/*`
  * new UI pages/components
  * services for querying Iceberg tables + reading R2 raw

### Shared packages

* `packages/shared` (Drizzle schema + migrations)
* optionally new packages:

  * `packages/sentry-protocol` (envelope parsing helpers)
  * `packages/sentry-model` (manifest types, validation)

---

## 6) Milestones with acceptance criteria

1. **Ingest MVP**

* JS + Python SDKs can send envelopes to your DSN host with zero ingestion errors
* Raw envelopes present in R2
* Manifests landing in Iceberg table via Pipelines ([Cloudflare Docs][2])

2. **Dashboard MVP**

* App worker can list recent events by project/time
* Can fetch an event by `event_id` and display key fields + raw JSON

3. **Compatibility hardening**

* Attachments accepted and stored
* Replay envelopes accepted and stored (even if not rendered yet)
* Unknown item types accepted and preserved

4. **Sentry-like UX (optional)**

* Grouped issues view
* Basic alerting hooks
* Performance percentiles

---

## 7) Immediate next step I recommend

Implement Phases A–D as your first PR sequence:

1. Pipelines stream + R2 Data Catalog sink + minimal SQL
2. D1 tables + DSN mgmt endpoints in app-worker
3. New sentry-ingest-worker that reads D1 and publishes to the stream
4. Query endpoints + minimal UI in app-worker

If you want, I can turn this into a **task-by-task backlog** (with file paths in your monorepo, Drizzle migration names, and wrangler binding blocks) aligned to your existing `apps/*` structure and deployment approach described in your README.

[1]: https://github.com/nicholasgriffintn/bitwobbly.com "GitHub - nicholasgriffintn/bitwobbly.com: Keep calm and check on"
[2]: https://developers.cloudflare.com/pipelines/streams/?utm_source=chatgpt.com "Streams - Pipelines"
[3]: https://developers.cloudflare.com/pipelines/sinks/?utm_source=chatgpt.com "Sinks - Pipelines"
[4]: https://developers.cloudflare.com/pipelines/sinks/available-sinks/r2-data-catalog/?utm_source=chatgpt.com "R2 Data Catalog - Pipelines"
[5]: https://develop.sentry.dev/sdk/data-model/envelopes/?utm_source=chatgpt.com "Envelopes - Sentry Developer Documentation"
[6]: https://developers.cloudflare.com/pipelines/streams/writing-to-streams/?utm_source=chatgpt.com "Writing to streams - Pipelines"
[7]: https://github.com/getsentry/sentry-docs/issues/10348?utm_source=chatgpt.com "Issue #10348 · getsentry/sentry-docs"
[8]: https://developers.cloudflare.com/pipelines/getting-started/?utm_source=chatgpt.com "Getting started · Cloudflare Pipelines Docs"
[9]: https://developers.cloudflare.com/pipelines/reference/wrangler-commands/?utm_source=chatgpt.com "Wrangler commands - Pipelines"
```
