import type { CheckJob } from "@bitwobbly/shared";
import { randomId } from "@bitwobbly/shared";

import type { Env } from "./types/env";
import { getDb } from "./lib/db";
import {
  getDueMonitors,
  claimMonitor,
  updateMonitorNextRun,
  unlockMonitor,
} from "./repositories/monitors";

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log("[SCHEDULER] Triggered at", new Date().toISOString());
    const db = getDb(env.DB);
    const nowSec = Math.floor(Date.now() / 1000);
    const lockTtlSec = 90;
    const maxBatches = 5;

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const due = await getDueMonitors(db, env.PUBLIC_TEAM_ID, nowSec, 200);
      console.log(
        `[SCHEDULER] Batch ${batchIndex + 1}: Found ${due.length} monitors due for checking`,
      );

      if (!due.length) return;

      for (const m of due) {
        const lockUntil = nowSec + lockTtlSec;
        const claim = await claimMonitor(db, m.id, nowSec, lockUntil);

        if (!claim.meta.changes) {
          console.log(
            `[SCHEDULER] Monitor ${m.id} (${m.name}) already locked, skipping`,
          );
          continue;
        }

        try {
          const msg: CheckJob = {
            job_id: randomId("job"),
            team_id: m.teamId,
            monitor_id: m.id,
            url: m.url,
            timeout_ms: Number(m.timeoutMs) || 8000,
            failure_threshold: Number(m.failureThreshold) || 3,
          };
          await env.CHECK_JOBS.send(msg);
          console.log(
            `[SCHEDULER] Enqueued check job for monitor ${m.id} (${m.name}) -> ${m.url}`,
          );

          const next =
            nowSec +
            Math.max(30, Math.min(3600, Number(m.intervalSeconds) || 60));
          ctx.waitUntil(updateMonitorNextRun(db, m.id, next, lockUntil));
        } catch (err) {
          console.error("scheduler enqueue failed", err);
          ctx.waitUntil(unlockMonitor(db, m.id, lockUntil));
        }
      }
    }
    console.log("[SCHEDULER] Completed");
  },
};
