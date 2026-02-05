import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "@bitwobbly/shared";
import {
  createEmailChannel,
  createWebhookChannel,
  deleteNotificationChannel,
  listNotificationChannels,
} from "../repositories/notification-channels";
import { requireTeam } from "../lib/auth-middleware";

const CreateChannelSchema = z
  .object({
    type: z.enum(["webhook", "email"]),
    url: z.string().url().optional(),
    to: z.string().email().optional(),
    from: z.string().optional(),
    subject: z.string().optional(),
    label: z.string().optional(),
    enabled: z.number().optional(),
  })
  .refine(
    (data) => {
      if (data.type === "webhook" && !data.url) return false;
      if (data.type === "email" && !data.to) return false;
      return true;
    },
    { message: "Missing required fields for selected type" }
  );

export const listChannelsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const channels = await listNotificationChannels(db, teamId);
    return { channels };
  }
);

export const createChannelFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateChannelSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    let created;
    if (data.type === "webhook" && data.url) {
      created = await createWebhookChannel(db, teamId, {
        url: data.url,
        label: data.label,
        enabled: data.enabled,
      });
    } else if (data.type === "email" && data.to) {
      created = await createEmailChannel(db, teamId, {
        to: data.to,
        from: data.from,
        subject: data.subject,
        label: data.label,
        enabled: data.enabled,
      });
    } else {
      throw new Error("Invalid channel data");
    }

    return { ok: true, ...created };
  });

export const deleteChannelFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteNotificationChannel(db, teamId, data.id);
    return { ok: true };
  });
