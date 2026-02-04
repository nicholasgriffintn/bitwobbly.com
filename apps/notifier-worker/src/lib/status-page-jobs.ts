import { nowIso, sha256Hex, type DB } from "@bitwobbly/shared";

import type { Env } from "../types/env";
import { insertStatusPageAuditLog } from "../repositories/status-page-audit-logs";
import {
  activateWebhookSubscriberIfTokenValid,
  getStatusPageNameAndSlug,
  getStatusPageSubscriberById,
} from "../repositories/status-page-subscribers";
import {
  listUnsentSubscriberEventsByIds,
  markSubscriberEventsSent,
} from "../repositories/status-page-events";

export type StatusPageJob =
  | {
      type: "status_page_confirm_email";
      job_id: string;
      subscriber_id: string;
      status_page_id: string;
      confirm_token: string;
      slug: string;
    }
  | {
      type: "status_page_verify_webhook";
      job_id: string;
      subscriber_id: string;
      status_page_id: string;
      confirm_token: string;
      slug: string;
    }
  | {
      type: "status_page_deliver_events";
      job_id: string;
      subscriber_id: string;
      event_ids: string[];
      is_digest?: boolean;
    };

export async function handleStatusPageJob(
  job: StatusPageJob,
  env: Env,
  db: DB,
  sendWebhook: (
    config: { url?: string },
    payload: Record<string, unknown>,
  ) => Promise<void>,
) {
  if (job.type === "status_page_confirm_email") {
    await handleConfirmEmail(job, env, db);
    return;
  }
  if (job.type === "status_page_verify_webhook") {
    await handleVerifyWebhook(job, env, db, sendWebhook);
    return;
  }
  if (job.type === "status_page_deliver_events") {
    await handleDeliverEvents(job, env, db, sendWebhook);
    return;
  }

  const _exhaustive: never = job;
  return _exhaustive;
}

async function handleConfirmEmail(
  job: Extract<StatusPageJob, { type: "status_page_confirm_email" }>,
  env: Env,
  db: DB,
) {
  const subscriber = await getStatusPageSubscriberById(db, job.subscriber_id);
  if (!subscriber) return;
  if (subscriber.statusPageId !== job.status_page_id) return;
  if (subscriber.channelType !== "email") return;
  if (subscriber.status !== "pending") return;

  const endpoint = subscriber.endpoint;
  const page = await getStatusPageNameAndSlug(db, subscriber.statusPageId);
  const pageName = page?.name || "Status page";
  const slug = page?.slug || job.slug;

  const confirmUrl = `${getAppOrigin()}/status/${encodeURIComponent(
    slug,
  )}/confirm?token=${encodeURIComponent(job.confirm_token)}`;

  const sig = await unsubscribeSig(env.SESSION_SECRET, subscriber.id);
  const unsubscribeUrl = sig
    ? `${getAppOrigin()}/status/${encodeURIComponent(
        slug,
      )}/unsubscribe?sid=${encodeURIComponent(subscriber.id)}&sig=${encodeURIComponent(
        sig,
      )}`
    : null;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "BitWobbly <bitwobbly@notifications.nicholasgriffin.dev>",
      to: [endpoint],
      subject: `Confirm your subscription: ${pageName}`,
      html: renderConfirmEmailHtml({ pageName, confirmUrl, unsubscribeUrl }),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    await insertStatusPageAuditLog(db, {
      statusPageId: subscriber.statusPageId,
      subscriberId: subscriber.id,
      action: "confirm_email_failed",
      meta: { error: err },
    });
    throw new Error(`Failed to send confirm email: ${err}`);
  }

  await insertStatusPageAuditLog(db, {
    statusPageId: subscriber.statusPageId,
    subscriberId: subscriber.id,
    action: "confirm_email_sent",
  });
}

async function handleVerifyWebhook(
  job: Extract<StatusPageJob, { type: "status_page_verify_webhook" }>,
  env: Env,
  db: DB,
  sendWebhook: (
    config: { url?: string },
    payload: Record<string, unknown>,
  ) => Promise<void>,
) {
  const subscriber = await getStatusPageSubscriberById(db, job.subscriber_id);
  if (!subscriber) return;
  if (subscriber.statusPageId !== job.status_page_id) return;
  if (subscriber.channelType !== "webhook") return;
  if (subscriber.status !== "pending") return;

  const url = subscriber.endpoint;
  const payload = {
    type: "bitwobbly.status_page.subscription_verify",
    token: job.confirm_token,
    status_page_id: subscriber.statusPageId,
    status_page_slug: job.slug,
    ts: new Date().toISOString(),
  };

  try {
    await sendWebhook({ url }, payload);
  } catch (e) {
    await insertStatusPageAuditLog(db, {
      statusPageId: subscriber.statusPageId,
      subscriberId: subscriber.id,
      action: "webhook_verification_failed",
      meta: { error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ok = await activateWebhookSubscriberIfTokenValid(db, {
    subscriberId: subscriber.id,
    confirmToken: job.confirm_token,
    nowSec,
  });
  if (!ok) {
    await insertStatusPageAuditLog(db, {
      statusPageId: subscriber.statusPageId,
      subscriberId: subscriber.id,
      action: "webhook_verification_token_invalid",
    });
    throw new Error("Webhook verification token invalid or expired");
  }

  await insertStatusPageAuditLog(db, {
    statusPageId: subscriber.statusPageId,
    subscriberId: subscriber.id,
    action: "webhook_verified_and_confirmed",
  });
}

async function handleDeliverEvents(
  job: Extract<StatusPageJob, { type: "status_page_deliver_events" }>,
  env: Env,
  db: DB,
  sendWebhook: (
    config: { url?: string },
    payload: Record<string, unknown>,
  ) => Promise<void>,
) {
  if (!Array.isArray(job.event_ids) || !job.event_ids.length) return;

  const subscriber = await getStatusPageSubscriberById(db, job.subscriber_id);
  if (!subscriber) return;
  if (subscriber.status !== "active") return;

  const events = await listUnsentSubscriberEventsByIds(
    db,
    subscriber.id,
    job.event_ids,
  );
  if (!events.length) return;

  const pageSlug = events[0].pageSlug;
  const pageName = events[0].pageName;
  const statusPageId = events[0].statusPageId;
  const pageUrl = `${getAppOrigin()}/status/${encodeURIComponent(pageSlug)}`;

  if (subscriber.channelType === "webhook") {
    await sendWebhook(
      { url: subscriber.endpoint },
      {
        type: "bitwobbly.status_page.events",
        status_page: { id: statusPageId, slug: pageSlug, name: pageName },
        digest: !!job.is_digest,
        events: events.map((e) => ({
          id: e.eventId,
          type: e.eventType,
          created_at: e.eventCreatedAt,
          incident: {
            id: e.incidentId,
            title: e.incidentTitle,
            status: e.incidentStatus,
            url: `${pageUrl}#incident-${encodeURIComponent(e.incidentId)}`,
          },
          update: e.updateMessage
            ? {
                status: e.updateStatus,
                message: e.updateMessage,
                created_at: e.updateCreatedAt,
              }
            : null,
        })),
        ts: new Date().toISOString(),
      },
    );
  } else if (subscriber.channelType === "email") {
    const sig = await unsubscribeSig(env.SESSION_SECRET, subscriber.id);
    const unsubscribeUrl = sig
      ? `${getAppOrigin()}/status/${encodeURIComponent(
          pageSlug,
        )}/unsubscribe?sid=${encodeURIComponent(subscriber.id)}&sig=${encodeURIComponent(sig)}`
      : null;

    const subject = job.is_digest
      ? `Digest: ${pageName}`
      : `Status update: ${pageName}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BitWobbly <bitwobbly@notifications.nicholasgriffin.dev>",
        to: [subscriber.endpoint],
        subject,
        html: renderUpdateEmailHtml({
          subject,
          pageName,
          pageUrl,
          unsubscribeUrl,
          events: events.map((e) => ({
            title: e.incidentTitle,
            status: e.incidentStatus,
            message: e.updateMessage || null,
          })),
        }),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      await insertStatusPageAuditLog(db, {
        statusPageId,
        subscriberId: subscriber.id,
        action: "notification_email_failed",
        meta: { error: err, event_count: events.length },
      });
      throw new Error(`Failed to send status page email: ${err}`);
    }
  }

  const sentAt = nowIso();
  await markSubscriberEventsSent(
    db,
    subscriber.id,
    events.map((e) => e.eventId),
    sentAt,
  );

  await insertStatusPageAuditLog(db, {
    statusPageId,
    subscriberId: subscriber.id,
    action: job.is_digest ? "digest_delivered" : "notification_delivered",
    meta: { event_count: events.length },
  });
}

function getAppOrigin(): string {
  return "https://bitwobbly.com";
}

async function unsubscribeSig(
  sessionSecret: string | undefined,
  subscriberId: string,
): Promise<string | null> {
  if (!sessionSecret?.trim()) return null;
  return sha256Hex(`${sessionSecret}:status_page_unsubscribe:${subscriberId}`);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderConfirmEmailHtml(input: {
  pageName: string;
  confirmUrl: string;
  unsubscribeUrl: string | null;
}): string {
  const pageName = escapeHtml(input.pageName);
  const unsub = input.unsubscribeUrl
    ? `<p style="margin: 24px 0 0 0; font-size: 12px; color: #6b7280;">Unsubscribe: <a href="${input.unsubscribeUrl}" style="color: #2563eb;">${input.unsubscribeUrl}</a></p>`
    : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirm Subscription</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111827; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="margin: 0 0 12px 0;">Confirm subscription</h1>
        <p style="margin: 0 0 16px 0;">You requested updates for <strong>${pageName}</strong>.</p>
        <p style="margin: 0 0 20px 0;">
          <a href="${input.confirmUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; padding: 10px 14px; border-radius: 6px;">Confirm subscription</a>
        </p>
        <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
          If you didn’t request this, you can ignore this email.
        </p>
        ${unsub}
      </body>
    </html>
  `;
}

function renderUpdateEmailHtml(input: {
  subject: string;
  pageName: string;
  pageUrl: string;
  unsubscribeUrl: string | null;
  events: Array<{ title: string; status: string; message: string | null }>;
}): string {
  const rowsHtml = input.events
    .map((e) => {
      const title = escapeHtml(e.title);
      const status = escapeHtml(e.status);
      const msg = e.message ? escapeHtml(e.message) : "";
      return `
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="font-weight: 700; margin: 0 0 6px 0;">${title}</div>
          <div style="color: #6b7280; font-size: 13px; margin-bottom: 10px;">${status}</div>
          ${msg ? `<div style="white-space: pre-wrap;">${msg}</div>` : ""}
        </div>
      `;
    })
    .join("");

  const unsub = input.unsubscribeUrl
    ? `<p style="margin: 22px 0 0 0; font-size: 12px; color: #6b7280;">Unsubscribe: <a href="${input.unsubscribeUrl}" style="color: #2563eb;">${input.unsubscribeUrl}</a></p>`
    : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(input.subject)}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111827; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="margin: 0 0 12px 0;">${escapeHtml(input.pageName)}</h1>
        <p style="margin: 0 0 18px 0;"><a href="${input.pageUrl}" style="color: #2563eb; font-weight: 600; text-decoration: none;">View status page</a></p>
        ${rowsHtml}
        ${unsub}
      </body>
    </html>
  `;
}

