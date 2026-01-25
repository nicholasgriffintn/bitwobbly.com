import type { AlertJob } from "@bitwobbly/shared";
import { withSentry } from "@sentry/cloudflare";

import type { Env } from "./types/env";
import { sendAlertEmail } from "./lib/email";
import { getDb } from "./lib/db";
import { getNotificationPoliciesForMonitor } from "./repositories/notification-policies";

const handler = {
  async queue(batch: MessageBatch<AlertJob>, env: Env): Promise<void> {
    const db = getDb(env.DB);

    for (const msg of batch.messages) {
      try {
        await handleAlert(msg.body, env, db);
        msg.ack();
      } catch (e: unknown) {
        const error = e;
        console.error("alert delivery failed", error?.message || e);
      }
    }
  },
};

export default withSentry(
  () => ({
    dsn: 'https://9f74b921b8364cf6af59cbe1a3aa0747@ingest.bitwobbly.com/3',
    environment: 'production',
    tracesSampleRate: 0.2,
  }),
  handler,
);

async function handleAlert(
  job: AlertJob,
  env: Env,
  db: ReturnType<typeof getDb>,
) {
  const policies = await getNotificationPoliciesForMonitor(
    db,
    job.team_id,
    job.monitor_id,
  );

  if (!policies.length) return;

  for (const p of policies) {
    if (job.status === "up" && Number(p.notifyOnRecovery) !== 1) continue;

    let cfg: unknown = null;
    try {
      cfg = JSON.parse(p.configJson);
    } catch {
      console.warn("invalid channel config", p.type);
      continue;
    }

    if (p.type === "webhook") {
      const config = cfg as { url?: string };
      const url = config.url;
      if (!url) continue;
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) continue;
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
      const timeout = setTimeout(() => controller.abort("timeout"), 8000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "bitwobbly-notifier/1.0",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) throw new Error(`Webhook failed: HTTP ${res.status}`);
    } else if (p.type === "email") {
      const emailConfig = cfg as {
        to?: string;
        from?: string;
        subject?: string;
      };
      const to = emailConfig.to;
      const from = emailConfig.from || "alerts@bitwobbly.com";
      const subject = emailConfig.subject || "BitWobbly Alert";

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
    status: "up" | "down";
    reason?: string;
    incidentId?: string;
  },
  env: Env,
) {
  const statusText =
    status === "down" ? "🔴 Service Down" : "🟢 Service Recovered";

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
    console.error("Failed to send email alert:", error);
    throw error;
  }
}
