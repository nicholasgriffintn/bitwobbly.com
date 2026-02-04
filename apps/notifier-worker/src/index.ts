import type {
  AlertJob,
  MonitorAlertJob,
  IssueAlertJob,
} from "@bitwobbly/shared";
import { withSentry } from "@sentry/cloudflare";

import type { Env } from "./types/env";
import { sendAlertEmail, sendIssueAlertEmail } from "./lib/email";
import { getDb } from "./lib/db";
import {
  handleStatusPageJob,
  type StatusPageJob,
} from "./lib/status-page-jobs";
import {
  getAlertRuleById,
  getChannelById,
  getIssueById,
  getProjectById,
  getAlertRulesForMonitor,
} from "./repositories/alert-rules";
import { acquireQueueDedupe } from "./repositories/queue-dedupe";

const handler = {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const db = getDb(env.DB);

    for (const msg of batch.messages) {
      try {
        const job = msg.body as unknown;

        if (!job || typeof job !== "object") {
          msg.ack();
          continue;
        }

        const jobType = (job as { type?: unknown }).type;
        if (typeof jobType !== "string") {
          msg.ack();
          continue;
        }

        if (jobType === "issue" || jobType === "monitor") {
          const alertJob = job as AlertJob;
          const ok = await acquireQueueDedupe(db, `alert:${alertJob.alert_id}`);
          if (!ok) {
            msg.ack();
            continue;
          }

          if (alertJob.type === "issue") {
            await handleIssueAlert(alertJob, env, db);
          } else {
            await handleMonitorAlert(alertJob, env, db);
          }
          msg.ack();
          continue;
        }

        if (jobType.startsWith("status_page_")) {
          const jobId = (job as { job_id?: unknown }).job_id;
          if (typeof jobId !== "string" || !jobId) {
            msg.ack();
            continue;
          }

          const ok = await acquireQueueDedupe(db, `status_page:${jobId}`);
          if (!ok) {
            msg.ack();
            continue;
          }

          await handleStatusPageJob(job as StatusPageJob, env, db, sendWebhook);
          msg.ack();
          continue;
        }

        msg.ack();
      } catch (e: unknown) {
        const error = e as Error;
        console.error("job delivery failed", error?.message || e);
      }
    }
  },
};

export default withSentry<Env, AlertJob>(
  () => ({
    dsn: "https://9f74b921b8364cf6af59cbe1a3aa0747@ingest.bitwobbly.com/3",
    environment: "production",
    tracesSampleRate: 0.2,
  }),
  handler
);

async function handleMonitorAlert(
  job: MonitorAlertJob,
  env: Env,
  db: ReturnType<typeof getDb>
) {
  const triggerType =
    job.status === "down" ? "monitor_down" : "monitor_recovery";
  const rules = await getAlertRulesForMonitor(db, job.monitor_id, triggerType);

  if (!rules.length) return;

  for (const rule of rules) {
    const channel = await getChannelById(db, rule.channelId);
    if (!channel) continue;

    let cfg: unknown = null;
    try {
      cfg = JSON.parse(channel.configJson);
    } catch {
      console.warn("invalid channel config", channel.type);
      continue;
    }

    if (channel.type === "webhook") {
      await sendWebhook(cfg as { url?: string }, {
        alert_id: job.alert_id,
        type: "monitor",
        team_id: job.team_id,
        monitor_id: job.monitor_id,
        status: job.status,
        reason: job.reason,
        incident_id: job.incident_id,
        ts: new Date().toISOString(),
      });
    } else if (channel.type === "email") {
      const emailConfig = cfg as { to?: string };
      const to = emailConfig.to;
      if (!to) continue;

      const statusText =
        job.status === "down" ? "Service Down" : "Service Recovered";

      await sendAlertEmail({
        email: to,
        statusText,
        alertId: job.alert_id,
        monitorId: job.monitor_id,
        status: job.status,
        reason: job.reason,
        incidentId: job.incident_id,
        resendApiKey: env.RESEND_API_KEY,
      });
    }
  }
}

async function handleIssueAlert(
  job: IssueAlertJob,
  env: Env,
  db: ReturnType<typeof getDb>
) {
  const rule = await getAlertRuleById(db, job.rule_id);
  if (!rule) {
    console.warn("Alert rule not found:", job.rule_id);
    return;
  }

  const channel = await getChannelById(db, rule.channelId);
  if (!channel) {
    console.warn("Notification channel not found or disabled:", rule.channelId);
    return;
  }

  const issue = await getIssueById(db, job.issue_id);
  if (!issue) {
    console.warn("Issue not found:", job.issue_id);
    return;
  }

  const project = await getProjectById(db, job.project_id);
  const projectName = project ? project.name : "Unknown Project";

  let cfg: unknown = null;
  try {
    cfg = JSON.parse(channel.configJson);
  } catch {
    console.warn("invalid channel config", channel.type);
    return;
  }

  if (channel.type === "webhook") {
    await sendWebhook(cfg as { url?: string }, {
      alert_id: job.alert_id,
      type: "issue",
      severity: job.severity,
      rule_id: job.rule_id,
      rule_name: rule.name,
      trigger: job.trigger_type,
      trigger_value: job.trigger_value,
      threshold: job.threshold,
      issue: {
        id: issue.id,
        title: issue.title,
        level: issue.level,
        culprit: issue.culprit,
        event_count: issue.eventCount,
        user_count: issue.userCount,
        first_seen: new Date(issue.firstSeenAt * 1000).toISOString(),
        last_seen: new Date(issue.lastSeenAt * 1000).toISOString(),
      },
      project_id: job.project_id,
      project_name: projectName,
      environment: job.environment,
      ts: new Date().toISOString(),
    });
  } else if (channel.type === "email") {
    const emailConfig = cfg as { to?: string };
    const to = emailConfig.to;
    if (!to) return;

    await sendIssueAlertEmail({
      email: to,
      alertId: job.alert_id,
      ruleName: rule.name,
      severity: job.severity,
      triggerType: job.trigger_type,
      triggerValue: job.trigger_value,
      threshold: job.threshold,
      issue: {
        id: issue.id,
        title: issue.title,
        level: issue.level,
        culprit: issue.culprit,
        eventCount: issue.eventCount,
        userCount: issue.userCount,
        firstSeenAt: issue.firstSeenAt,
        lastSeenAt: issue.lastSeenAt,
      },
      projectName,
      environment: job.environment,
      resendApiKey: env.RESEND_API_KEY,
    });
  }
}

async function sendWebhook(
  config: { url?: string },
  payload: Record<string, unknown>
): Promise<void> {
  const url = config.url;
  if (!url) return;

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return;
  } catch {
    return;
  }

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
}
