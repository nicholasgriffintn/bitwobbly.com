import type { AlertJob } from '@bitwobbly/shared';

import type { Env } from './types/env';
import { sendAlertEmail } from './lib/email';

export default {
  async queue(batch: MessageBatch<AlertJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await handleAlert(msg.body, env);
        msg.ack();
      } catch (e: any) {
        console.error('alert delivery failed', e?.message || e);
      }
    }
  },
};

async function handleAlert(job: AlertJob, env: Env) {
  const policies = (
    await env.DB.prepare(
      `
    SELECT np.threshold_failures, np.notify_on_recovery, nc.type, nc.config_json
    FROM notification_policies np
    JOIN notification_channels nc ON nc.id = np.channel_id
    WHERE np.team_id = ? AND np.monitor_id = ? AND nc.enabled = 1
  `,
    )
      .bind(job.team_id, job.monitor_id)
      .all()
  ).results as any[];

  if (!policies.length) return;

  for (const p of policies) {
    if (job.status === 'up' && Number(p.notify_on_recovery) !== 1) continue;

    let cfg: any = null;
    try {
      cfg = JSON.parse(p.config_json);
    } catch {
      console.warn('invalid channel config', p.id);
      continue;
    }

    if (p.type === 'webhook') {
      const url = cfg.url;
      if (!url) continue;
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      } catch {
        continue;
      }

      const payload = {
        alert_id: job.alert_id,
        team_id: job.team_id,
        monitor_id: job.monitor_id,
        status: job.status,
        reason: job.reason,
        incident_id: job.incident_id,
        ts: new Date().toISOString(),
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort('timeout'), 8000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'bitwobbly-notifier/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) throw new Error(`Webhook failed: HTTP ${res.status}`);
    } else if (p.type === 'email') {
      const to = cfg.to;
      const from = cfg.from || 'alerts@bitwobbly.com';
      const subject = cfg.subject || 'BitWobbly Alert';

      if (!to) continue;

      await handleEmailAlert(
        {
          to,
          from,
          subject,
          alertId: job.alert_id,
          monitorId: job.monitor_id,
          status: job.status,
          reason: job.reason,
          incidentId: job.incident_id,
        },
        env,
      );
    }
  }
}

async function handleEmailAlert(
  {
    to,
    from,
    subject,
    alertId,
    monitorId,
    status,
    reason,
    incidentId,
  }: {
    to: string;
    from: string;
    subject: string;
    alertId: string;
    monitorId: string;
    status: 'up' | 'down';
    reason?: string;
    incidentId?: string;
  },
  env: Env,
) {
  const statusText =
    status === 'down' ? '🔴 Service Down' : '🟢 Service Recovered';

  try {
    await sendAlertEmail({
      email: to,
      statusText,
      alertId,
      monitorId,
      status,
      reason,
      incidentId,
      resendApiKey: env.RESEND_API_KEY,
    });
  } catch (error) {
    console.error('Failed to send email alert:', error);
    throw error;
  }
}
