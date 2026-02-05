import type { CheckJob, MonitorType } from "@bitwobbly/shared";
import {
  MonitorTypeValues,
  randomId,
  createLogger,
  serialiseError,
} from "@bitwobbly/shared";
import * as Sentry from "@sentry/cloudflare";

import type { Env } from "./types/env";
import { assertEnv } from "./types/env";
import { getDb } from "@bitwobbly/shared";
import { runStatusPageDigests } from "./lib/status-page-digests";
import {
  getDueMonitors,
  claimMonitor,
  updateMonitorNextRun,
  unlockMonitor,
} from "./repositories/monitors";
import { cleanupExpiredSessions } from "./repositories/sessions";

const logger = createLogger({ service: "scheduler-worker" });

const monitorTypeSet: ReadonlySet<string> = new Set(MonitorTypeValues);
function isMonitorType(value: string): value is MonitorType {
  return monitorTypeSet.has(value);
}

const handler = {
  async scheduled(
    event: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    assertEnv(env);
    await Sentry.withMonitor(
      "monitor-scheduler",
      async () => {
        const db = getDb(env.DB, { withSentry: true });
        const nowSec = Math.floor(Date.now() / 1000);
        const lockTtlSec = 90;
        const maxBatches = 5;

        try {
          const cleanedSessions = await cleanupExpiredSessions(db, nowSec);
          if (cleanedSessions > 0) {
            logger.info("cleaned expired sessions", { count: cleanedSessions });
          }
        } catch (error) {
          logger.error("session cleanup failed", {
            error: serialiseError(error),
          });
        }

        try {
          await runStatusPageDigests(db, env, ctx);
        } catch (error) {
          logger.error("status page digest failed", {
            error: serialiseError(error),
          });
        }

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
              if (!m.url && m.type !== "heartbeat") {
                ctx.waitUntil(unlockMonitor(db, m.id, lockUntil));
                continue;
              }

              const monitorType =
                m.type && isMonitorType(m.type) ? m.type : "http";
              const msg: CheckJob = {
                job_id: randomId("job"),
                team_id: m.teamId,
                monitor_id: m.id,
                monitor_type: monitorType,
                url: m.url || "",
                interval_seconds: Number(m.intervalSeconds) || 60,
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
              logger.error("scheduler enqueue failed", {
                error: serialiseError(err),
              });
              ctx.waitUntil(unlockMonitor(db, m.id, lockUntil));
            }
          }
        }
      },
      {
        schedule: { type: "crontab", value: event.cron },
        checkinMargin: 2,
        maxRuntime: 5,
        timezone: "UTC",
      }
    );
  },
};

export default Sentry.withSentry<Env>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.2,
  }),
  handler
);
