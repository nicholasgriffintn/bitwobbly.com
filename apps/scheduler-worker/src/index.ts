import type { CheckJob } from "@bitwobbly/shared";
import { randomId } from "@bitwobbly/shared";
import * as Sentry from "@sentry/cloudflare";

import type { Env } from "./types/env";
import { getDb } from "./lib/db";
import {
  getDueMonitors,
  claimMonitor,
  updateMonitorNextRun,
  unlockMonitor,
} from "./repositories/monitors";

const handler = {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    await Sentry.withMonitor(
      'monitor-scheduler',
      async () => {
        const db = getDb(env.DB);
        const nowSec = Math.floor(Date.now() / 1000);
        const lockTtlSec = 90;
        const maxBatches = 5;

        for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
          const due = await getDueMonitors(db, nowSec, 200);

          if (!due.length) return;

          for (const m of due) {
            const lockUntil = nowSec + lockTtlSec;
            const claim = await claimMonitor(db, m.id, nowSec, lockUntil);

            if (!claim.meta.changes) {
              continue;
            }

            try {
              const msg: CheckJob = {
                job_id: randomId('job'),
                team_id: m.teamId,
                monitor_id: m.id,
                monitor_type: m.type || 'http',
                url: m.url,
                timeout_ms: Number(m.timeoutMs) || 8000,
                failure_threshold: Number(m.failureThreshold) || 3,
                external_config: m.externalConfig || undefined,
              };
              await env.CHECK_JOBS.send(msg);

              const next =
                nowSec +
                Math.max(30, Math.min(3600, Number(m.intervalSeconds) || 60));
              ctx.waitUntil(updateMonitorNextRun(db, m.id, next, lockUntil));
            } catch (err) {
              console.error('scheduler enqueue failed', err);
              ctx.waitUntil(unlockMonitor(db, m.id, lockUntil));
            }
          }
        }
      },
      {
        schedule: { type: 'crontab', value: event.cron },
        checkinMargin: 2,
        maxRuntime: 5,
        timezone: 'UTC',
      },
    );
  },
};

export default Sentry.withSentry(
  () => ({
    dsn: 'https://a2ada73c0a154eb5b035f850d8e0d505@ingest.bitwobbly.com/4',
    environment: 'production',
    tracesSampleRate: 0.2,
  }),
  handler,
);
