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

### Missing Core Features

#### 1. Manual Component Status in Incidents

When creating an incident, users should be able to manually mark specific components as affected, and this should impact uptime calculations.

**Current Gap:**

- Incidents can optionally reference a `monitorId` or `statusPageId`
- No direct link between incidents and components
- Uptime is only calculated from automated monitor checks
- Manual incidents don't affect component status or metrics

**Planned Implementation:**

**Schema Changes:**

UPDATE DRIZZLE SCHEMA ONLY, DRIZZLE MIGRATIONS WILL HANDLE THE REST.

```sql
-- Junction table for incident-component relationships
CREATE TABLE incident_components (
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  component_id TEXT NOT NULL REFERENCES components(id),
  impact_level TEXT NOT NULL, -- 'down', 'degraded', 'maintenance'
  PRIMARY KEY (incident_id, component_id)
);

-- Track manual overrides separately for metrics
ALTER TABLE components ADD COLUMN current_status TEXT DEFAULT 'operational'; -- 'operational', 'degraded', 'down', 'maintenance'
ALTER TABLE components ADD COLUMN status_updated_at INTEGER;
```

**API Changes:**

- `POST /api/incidents` accepts `affectedComponents: Array<{ componentId: string, impactLevel: string }>`
- When incident is created/updated, update `components.current_status` for affected components
- When incident is resolved, reset component status to operational (or derive from monitors)

**Metrics Impact:**

- Analytics Engine queries should factor in manual downtime periods
- New metric type: `manual_downtime` alongside existing `monitor_check` events
- Uptime calculation: `(operational_time - manual_downtime) / total_time`
- Display manual incidents as distinct from automated incidents in graphs

**UI Changes:**

- Incident creation modal: checkbox list of components with impact level selector
- Component cards show current status from incidents + monitors
- Timeline view showing manual vs. automated status changes

#### 2. Third-Party Component Monitoring

Support for monitoring external dependencies that aren't under direct HTTP monitoring control.

**Use Cases:**

- Display third-party service status (AWS, GitHub, Stripe, etc.) on your status page
- Aggregate status from multiple providers into a single view
- Monitor services that provide their own status APIs or RSS feeds

**Implementation Options:**

**Option A: Status Page Aggregation**

- Fetch status from well-known status pages (statuspage.io format, RSS feeds)
- Supported sources:
  - Atlassian Statuspage (JSON API)
  - RSS/Atom feeds
  - Custom JSON endpoints
- Store aggregated status in KV with TTL
- Display as read-only components on status pages

**Option B: Manual Third-Party Components**

- Create components marked as `type: 'third-party'`
- Link to existing webhook or external monitors
- Display with external link to provider's status page

**Schema Changes:**

UPDATE DRIZZLE SCHEMA ONLY, DRIZZLE MIGRATIONS WILL HANDLE THE REST.

```sql
ALTER TABLE components ADD COLUMN type TEXT DEFAULT 'internal'; -- 'internal', 'third-party'
ALTER TABLE components ADD COLUMN external_status_url TEXT; -- Link to provider's status page
ALTER TABLE components ADD COLUMN external_monitor_config TEXT; -- JSON config for aggregation
```

**Configuration:**

```typescript
{
  "source": "statuspage.io",
  "apiUrl": "https://status.github.com/api/v2/components.json",
  "componentId": "brv1bkgrwx7q", // GitHub's Git Operations component ID
  "pollInterval": 300 // seconds
}
```

#### 3. Enhanced Uptime Graphs and Historical Reporting

**Current State:**

- Analytics Engine stores check results and latency
- Basic uptime display showing green bars (90-day view)
- No percentage calculations or historical comparisons

**Planned Enhancements:**

**Backend API Additions:**

- `GET /api/components/:id/uptime?period=7d|30d|90d` -- returns uptime percentage
- `GET /api/components/:id/metrics?from=<timestamp>&to=<timestamp>` -- returns detailed metrics
- `GET /api/monitors/:id/history?period=7d|30d|90d` -- returns check history with failures
- Aggregate queries on Analytics Engine:
  ```sql
  SELECT
    toStartOfInterval(timestamp, INTERVAL '1' HOUR) as bucket,
    countIf(status = 'up') as up_count,
    countIf(status = 'down') as down_count,
    avg(latency_ms) as avg_latency
  FROM monitor_checks
  WHERE monitor_id = ?
    AND timestamp > now() - INTERVAL '7' DAY
  GROUP BY bucket
  ORDER BY bucket
  ```

**Frontend Chart Improvements:**

- Replace simple green bar visualization with proper charts using Recharts or similar
- Component status page:
  - **Uptime timeline**: Hourly/daily buckets showing operational (green), degraded (yellow), down (red)
  - **Latency graph**: Line chart showing response time trends over selected period
  - **Availability heatmap**: Calendar-style view (like GitHub contributions) showing daily uptime %
  - **SLA calculator**: Display uptime % with targets (99.9%, 99.95%, 99.99%)
- Dashboard overview:
  - Multi-component comparison chart
  - Alert frequency histogram
  - MTTD (Mean Time To Detect) and MTTR (Mean Time To Repair) metrics

**Calculations to Implement:**

```typescript
interface UptimeMetrics {
  period: string; // '7d', '30d', '90d'
  uptimePercentage: number; // 99.87
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  incidents: number;
  totalDowntimeMinutes: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}
```

#### 4. Custom Domain Configuration for Status Pages

Allow users to serve their status pages from their own domain (e.g., `status.acme.com`) instead of `bitwobbly.com/status/acme`.

**Architecture:**

**Cloudflare Workers Custom Domains Approach:**

- Use Cloudflare for SaaS (Custom Hostnames)
- Users add CNAME pointing their subdomain to Cloudflare
- Automatic SSL certificate provisioning via Cloudflare
- Workers route requests based on custom hostname

**Implementation Steps:**

**1. Schema Changes:**

UPDATE DRIZZLE SCHEMA ONLY, DRIZZLE MIGRATIONS WILL HANDLE THE REST.

```sql
ALTER TABLE status_pages ADD COLUMN custom_domain TEXT UNIQUE;
ALTER TABLE status_pages ADD COLUMN domain_verification_token TEXT;
ALTER TABLE status_pages ADD COLUMN domain_verified_at INTEGER;
ALTER TABLE status_pages ADD COLUMN ssl_status TEXT DEFAULT 'pending'; -- 'pending', 'active', 'error'
```

**2. Domain Verification Flow:**

- User enters desired custom domain in settings (e.g., `status.acme.com`)
- System generates verification token
- User must add DNS records:
  - CNAME: `status.acme.com` → `verify.bitwobbly.com`
  - TXT: `_bitwobbly-verify.status.acme.com` → `<verification-token>`
- System periodically checks DNS records via Cloudflare DNS API or DOH
- Once verified, activate custom hostname

**3. Cloudflare for SaaS Setup:**

```bash
# Add custom hostname via Cloudflare API
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/custom_hostnames" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "status.acme.com",
    "ssl": {
      "method": "http",
      "type": "dv",
      "settings": {
        "min_tls_version": "1.2"
      }
    }
  }'
```

**4. Worker Routing Logic:**

```typescript
// In app-worker request handler
const hostname = new URL(request.url).hostname;

// Check if custom domain
const customStatusPage = await db
  .select()
  .from(statusPages)
  .where(eq(statusPages.customDomain, hostname))
  .where(eq(statusPages.domainVerified, 1))
  .get();

if (customStatusPage) {
  // Serve status page for custom domain
  return renderStatusPage(customStatusPage);
}

// Otherwise, handle normal bitwobbly.com routes
```

**5. DNS Configuration Documentation:**

Users would need to configure DNS as follows:

```
Type:  CNAME
Name:  status (or desired subdomain)
Value: cname.bitwobbly.com
Proxy: Yes (orange cloud in Cloudflare)
```

For verification:

```
Type:  TXT
Name:  _bitwobbly-verify.status
Value: <token from dashboard>
TTL:   Auto
```

**6. SSL Certificate Management:**

- Cloudflare for SaaS automatically provisions SSL certificates
- Monitor certificate status via Cloudflare API
- Display SSL status in dashboard: Pending → Active → Renewing
- Support custom certificates upload (advanced users)

**7. UI Changes:**

- Status page settings: "Custom Domain" section
- Domain input field with validation (must be subdomain)
- DNS configuration instructions with copyable values
- Verification status badge (Pending / Verified / Error)
- SSL status indicator
- "Remove Custom Domain" button

**8. Cloudflare Configuration Requirements:**

```typescript
// In wrangler.json for app-worker
{
  "name": "bitwobbly-app",
  "routes": [
    { "pattern": "bitwobbly.com/*", "zone_name": "bitwobbly.com" },
    { "pattern": "*.customers.bitwobbly.com/*", "zone_name": "bitwobbly.com" }
  ]
}
```

**Security Considerations:**

- Rate limit domain verification attempts (max 5/hour)
- Validate domain ownership before activation
- Prevent takeover of already-claimed domains
- Log all custom domain configuration changes
- Support domain transfer between teams with re-verification

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
- **Public status page theming** -- Schema fields exist but no theme editor or preview in the dashboard.
- **API keys** -- No programmatic API access for users (settings page placeholder exists).
