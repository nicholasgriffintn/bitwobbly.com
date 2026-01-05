import type { Env } from './env';
import type { AlertJob } from '@bitwobbly/shared';

export default {
  async queue(batch: MessageBatch<AlertJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await handleAlert(msg.body, env);
        msg.ack();
      } catch (e: any) {
        console.error('alert delivery failed', e?.message || e);
        // retry: do not ack
      }
    }
  },
};

async function handleAlert(job: AlertJob, env: Env) {
  // Fetch enabled webhook channels and policies for this monitor
  const policies = (
    await env.DB.prepare(
      `
    SELECT np.threshold_failures, np.notify_on_recovery, nc.type, nc.config_json
    FROM notification_policies np
    JOIN notification_channels nc ON nc.id = np.channel_id
    WHERE np.team_id = ? AND np.monitor_id = ? AND nc.enabled = 1
  `
    )
      .bind(job.team_id, job.monitor_id)
      .all()
  ).results as any[];

  if (!policies.length) return;

  for (const p of policies) {
    if (job.status === 'up' && Number(p.notify_on_recovery) !== 1) continue;

    if (p.type === 'webhook') {
      const cfg = JSON.parse(p.config_json);
      const url = cfg.url;
      if (!url) continue;

      const payload = {
        team_id: job.team_id,
        monitor_id: job.monitor_id,
        status: job.status,
        reason: job.reason,
        incident_id: job.incident_id,
        ts: new Date().toISOString(),
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Webhook failed: HTTP ${res.status}`);
    }
  }
}
