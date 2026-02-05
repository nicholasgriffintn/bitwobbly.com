import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";
import { randomId } from "@bitwobbly/shared";

import { getDb } from "@bitwobbly/shared";
import { getExternalStatusPageBySlug } from "../repositories/status-pages";
import {
  isStatusPageUnlocked,
  useStatusPageSession,
} from "../lib/status-page-session";
import {
  createOrRefreshSubscription,
  confirmSubscriptionByToken,
  getSubscriberByEndpoint,
  insertSubscriptionAuditLog,
  unsubscribeById,
} from "../repositories/status-page-subscribers";
import {
  statusPageUnsubscribeSig,
  verifyStatusPageUnsubscribeSig,
} from "../lib/status-page-subscription-signing";

const SubscribeSchema = z
  .object({
    slug: z.string(),
    channel_type: z.enum(["email", "webhook"]),
    endpoint: z.string().min(3),
    digest_cadence: z.enum(["immediate", "daily", "weekly"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel_type === "email") {
      const res = z.string().email().safeParse(data.endpoint);
      if (!res.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid email address",
          path: ["endpoint"],
        });
      }
    } else {
      const res = z.string().url().safeParse(data.endpoint);
      if (!res.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid webhook URL",
          path: ["endpoint"],
        });
        return;
      }
      try {
        const u = new URL(data.endpoint);
        if (!["http:", "https:"].includes(u.protocol)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Webhook URL must be http(s)",
            path: ["endpoint"],
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid webhook URL",
          path: ["endpoint"],
        });
      }
    }
  });

export type PublicSubscribeResult =
  | { kind: "already_subscribed" }
  | { kind: "confirmation_sent" }
  | { kind: "password_required" }
  | {
      kind: "webhook_verification_queued";
      unsubscribe: { sid: string; sig: string };
    };

export const subscribeToStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SubscribeSchema.parse(data))
  .handler(async ({ data }): Promise<PublicSubscribeResult> => {
    const vars = env;
    const db = getDb(vars.DB);

    const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
      key: `status_subscribe:${data.slug}:${data.channel_type}`,
    });
    if (!success) throw new Error("Rate limit exceeded");

    const page = await getExternalStatusPageBySlug(db, data.slug);
    if (!page) throw notFound();

    if (page.accessMode === "private") {
      const session = await useStatusPageSession();
      if (!isStatusPageUnlocked(session, data.slug)) {
        return { kind: "password_required" };
      }
    }

    const channelType = data.channel_type;
    const digestCadence = data.digest_cadence || "immediate";

    const endpoint =
      channelType === "email"
        ? data.endpoint.trim().toLowerCase()
        : data.endpoint.trim();

    const existing = await getSubscriberByEndpoint(
      db,
      page.id,
      channelType,
      endpoint
    );

    if (existing?.status === "active" && existing.confirmedAt) {
      await insertSubscriptionAuditLog(db, {
        statusPageId: page.id,
        subscriberId: existing.id,
        action: "subscribe_already_active",
        meta: { channel_type: channelType, digest_cadence: digestCadence },
      });
      return { kind: "already_subscribed" };
    }

    const confirmToken = randomId("spc");
    const confirmExpiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const { subscriberId } = await createOrRefreshSubscription(db, {
      statusPageId: page.id,
      channelType,
      endpoint,
      digestCadence,
      confirmToken,
      confirmExpiresAt,
    });

    await insertSubscriptionAuditLog(db, {
      statusPageId: page.id,
      subscriberId,
      action: "subscribe_created_or_refreshed",
      meta: { channel_type: channelType, digest_cadence: digestCadence },
    });

    const unsubscribeSig = await statusPageUnsubscribeSig(
      vars.SESSION_SECRET,
      subscriberId
    );

    if (channelType === "email") {
      await vars.ALERT_JOBS.send({
        type: "status_page_confirm_email",
        job_id: randomId("spj"),
        subscriber_id: subscriberId,
        status_page_id: page.id,
        confirm_token: confirmToken,
        slug: data.slug,
      });

      await insertSubscriptionAuditLog(db, {
        statusPageId: page.id,
        subscriberId,
        action: "confirm_email_enqueued",
      });

      return { kind: "confirmation_sent" };
    }

    await vars.ALERT_JOBS.send({
      type: "status_page_verify_webhook",
      job_id: randomId("spj"),
      subscriber_id: subscriberId,
      status_page_id: page.id,
      confirm_token: confirmToken,
      slug: data.slug,
    });

    await insertSubscriptionAuditLog(db, {
      statusPageId: page.id,
      subscriberId,
      action: "webhook_verification_enqueued",
    });

    return {
      kind: "webhook_verification_queued",
      unsubscribe: { sid: subscriberId, sig: unsubscribeSig },
    };
  });

const ConfirmSchema = z.object({
  slug: z.string(),
  token: z.string().min(8),
});

export const confirmStatusPageSubscriptionFn = createServerFn({
  method: "POST",
})
  .inputValidator((data: unknown) => ConfirmSchema.parse(data))
  .handler(async ({ data }) => {
    const vars = env;
    const db = getDb(vars.DB);

    const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
      key: `status_confirm:${data.slug}`,
    });
    if (!success) throw new Error("Rate limit exceeded");

    const page = await getExternalStatusPageBySlug(db, data.slug);
    if (!page) throw notFound();

    const nowSec = Math.floor(Date.now() / 1000);
    const confirmed = await confirmSubscriptionByToken(db, {
      statusPageId: page.id,
      confirmToken: data.token,
      nowSec,
    });
    if (!confirmed) {
      throw new Error("Invalid or expired confirmation link");
    }

    await insertSubscriptionAuditLog(db, {
      statusPageId: page.id,
      subscriberId: confirmed.subscriberId,
      action: "subscription_confirmed",
    });

    return { ok: true };
  });

const UnsubscribeSchema = z.object({
  slug: z.string(),
  sid: z.string(),
  sig: z.string().min(32),
});

export const unsubscribeFromStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UnsubscribeSchema.parse(data))
  .handler(async ({ data }) => {
    const vars = env;
    const db = getDb(vars.DB);

    const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
      key: `status_unsubscribe:${data.slug}`,
    });
    if (!success) throw new Error("Rate limit exceeded");

    const page = await getExternalStatusPageBySlug(db, data.slug);
    if (!page) throw notFound();

    const okSig = await verifyStatusPageUnsubscribeSig(
      vars.SESSION_SECRET,
      data.sid,
      data.sig
    );
    if (!okSig) {
      throw new Error("Invalid unsubscribe link");
    }

    const ok = await unsubscribeById(db, {
      statusPageId: page.id,
      subscriberId: data.sid,
    });
    if (!ok) throw notFound();

    await insertSubscriptionAuditLog(db, {
      statusPageId: page.id,
      subscriberId: data.sid,
      action: "unsubscribed",
    });

    return { ok: true };
  });
