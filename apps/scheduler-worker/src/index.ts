import type { Env } from './env';
import type { CheckJob } from '@bitwobbly/shared';
import { randomId } from '@bitwobbly/shared';

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const lockTtlSec = 90;
    const maxBatches = 5;

    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const due = (
        await env.DB.prepare(
          `
        SELECT id, team_id, url, timeout_ms, interval_seconds, failure_threshold
        FROM monitors
        WHERE team_id = ? AND enabled = 1 AND next_run_at <= ? AND locked_until <= ?
        LIMIT 200
      `
        )
          .bind(env.PUBLIC_TEAM_ID, nowSec, nowSec)
          .all()
      ).results as any[];

      if (!due.length) return;

      for (const m of due) {
        const lockUntil = nowSec + lockTtlSec;
        const claim = await env.DB.prepare(
          `
          UPDATE monitors
          SET locked_until = ?
          WHERE id = ? AND enabled = 1 AND next_run_at <= ? AND locked_until <= ?
        `
        )
          .bind(lockUntil, m.id, nowSec, nowSec)
          .run();

        if (!claim.changes) continue;

        try {
          const msg: CheckJob = {
            job_id: randomId('job'),
            team_id: m.team_id,
            monitor_id: m.id,
            url: m.url,
            timeout_ms: Number(m.timeout_ms) || 8000,
            failure_threshold: Number(m.failure_threshold) || 3,
          };
          await env.CHECK_JOBS.send(msg);

          const next =
            nowSec +
            Math.max(30, Math.min(3600, Number(m.interval_seconds) || 60));
          ctx.waitUntil(
            env.DB.prepare(
              `
              UPDATE monitors
              SET next_run_at = ?, locked_until = 0
              WHERE id = ? AND locked_until = ?
            `
            )
              .bind(next, m.id, lockUntil)
              .run()
          );
        } catch (err) {
          console.error('scheduler enqueue failed', err);
          ctx.waitUntil(
            env.DB.prepare(
              `
              UPDATE monitors
              SET locked_until = 0
              WHERE id = ? AND locked_until = ?
            `
            )
              .bind(m.id, lockUntil)
              .run()
          );
        }
      }
    }
  },
};
