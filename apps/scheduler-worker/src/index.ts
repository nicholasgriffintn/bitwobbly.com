import type { Env } from './env';
import type { CheckJob } from '@bitwobbly/shared';
import { randomId } from '@bitwobbly/shared';

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    // Find monitors due
    const nowSec = Math.floor(Date.now() / 1000);
    const due = (
      await env.DB.prepare(
        `
      SELECT id, team_id, url, timeout_ms, interval_seconds, failure_threshold
      FROM monitors
      WHERE team_id = ? AND enabled = 1 AND next_run_at <= ?
      LIMIT 200
    `
      )
        .bind(env.PUBLIC_TEAM_ID, nowSec)
        .all()
    ).results as any[];

    if (!due.length) return;

    // Update next_run_at in a best-effort manner to avoid double enqueue.
    // If the scheduler overlaps, the checker/incident logic is idempotent enough for MVP.
    for (const m of due) {
      const next =
        nowSec + Math.max(30, Math.min(3600, Number(m.interval_seconds) || 60));
      ctx.waitUntil(
        env.DB.prepare('UPDATE monitors SET next_run_at = ? WHERE id = ?')
          .bind(next, m.id)
          .run()
      );
    }

    // Enqueue jobs
    const msgs: CheckJob[] = due.map((m) => ({
      job_id: randomId('job'),
      team_id: m.team_id,
      monitor_id: m.id,
      url: m.url,
      timeout_ms: Number(m.timeout_ms) || 8000,
      failure_threshold: Number(m.failure_threshold) || 3,
    }));

    // Send one-by-one for clarity (can be batched later).
    for (const msg of msgs) {
      await env.CHECK_JOBS.send(msg);
    }
  },
};
