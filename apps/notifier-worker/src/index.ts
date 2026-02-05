import type {
  AlertJob,
  MonitorAlertJob,
  IssueAlertJob,
} from "@bitwobbly/shared";
import { isAlertJob, createLogger, serialiseError } from "@bitwobbly/shared";
import { withSentry } from "@sentry/cloudflare";

import type { Env } from "./types/env";
import { assertEnv } from "./types/env";
import { sendAlertEmail, sendIssueAlertEmail } from "./lib/email";
import { getDb } from "@bitwobbly/shared";
import {
  handleStatusPageJob,
  isStatusPageJob,
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

const logger = createLogger({ service: "notifier-worker" });

const handler = {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    assertEnv(env);
    const db = getDb(env.DB, { withSentry: true });

    for (const msg of batch.messages) {
      try {
        const job = msg.body;

        if (isAlertJob(job)) {
          const ok = await acquireQueueDedupe(db, `alert:${job.alert_id}`);
          if (!ok) {
            msg.ack();
            continue;
          }

          if (job.type === "issue") {
            await handleIssueAlert(job, env, db);
          } else {
            await handleMonitorAlert(job, env, db);
          }
          msg.ack();
          continue;
        }

        if (isStatusPageJob(job)) {
          const ok = await acquireQueueDedupe(db, `status_page:${job.job_id}`);
          if (!ok) {
            msg.ack();
            continue;
          }

          await handleStatusPageJob(job, env, db, sendWebhook);
          msg.ack();
          continue;
        }

        msg.ack();
      } catch (e: unknown) {
        logger.error("job delivery failed", { error: serialiseError(e) });
      }
    }
  },
};

export default withSentry<Env, AlertJob>(
  (env) => ({
    dsn: env.SENTRY_DSN,
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
      logger.warn("invalid channel config", { channelType: channel.type });
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
    logger.warn("alert rule not found", { ruleId: job.rule_id });
    return;
  }

  const channel = await getChannelById(db, rule.channelId);
  if (!channel) {
    logger.warn("notification channel not found or disabled", {
      channelId: rule.channelId,
    });
    return;
  }

  const issue = await getIssueById(db, job.issue_id);
  if (!issue) {
    logger.warn("issue not found", { issueId: job.issue_id });
    return;
  }

  const project = await getProjectById(db, job.project_id);
  const projectName = project ? project.name : "Unknown Project";

  let cfg: unknown = null;
  try {
    cfg = JSON.parse(channel.configJson);
  } catch {
    logger.warn("invalid channel config", { channelType: channel.type });
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
