import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "../lib/db";
import {
  createNotificationPolicy,
  deleteNotificationPolicy,
  listNotificationPolicies,
} from "../repositories/notification-policies";
import { getMonitorById } from "../repositories/monitors";
import { notificationChannelExists } from "../repositories/notification-channels";
import { clampInt } from "../lib/utils";
import { requireTeam } from "../lib/auth-middleware";

const CreatePolicySchema = z.object({
  monitor_id: z.string(),
  channel_id: z.string(),
  threshold_failures: z.number().optional(),
  notify_on_recovery: z.number().optional(),
});

export const listPoliciesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const policies = await listNotificationPolicies(db, teamId);
    return { policies };
  },
);

export const createPolicyFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreatePolicySchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const monitor = await getMonitorById(db, teamId, data.monitor_id);
    if (!monitor) throw new Error("Monitor not found");

    const channelExists = await notificationChannelExists(
      db,
      teamId,
      data.channel_id,
    );
    if (!channelExists) throw new Error("Notification channel not found");

    const threshold_failures = clampInt(data.threshold_failures || 3, 1, 10, 3);
    const notify_on_recovery = data.notify_on_recovery === 0 ? 0 : 1;

    const created = await createNotificationPolicy(db, teamId, {
      monitor_id: data.monitor_id,
      channel_id: data.channel_id,
      threshold_failures,
      notify_on_recovery,
    });

    return { ok: true, ...created };
  });

export const deletePolicyFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteNotificationPolicy(db, teamId, data.id);
    return { ok: true };
  });
