import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "../lib/db";
import { requireTeam } from "../lib/auth-middleware";
import {
  createMonitorGroup,
  deleteMonitorGroup,
  listMonitorGroups,
} from "../repositories/monitor-groups";

export const listMonitorGroupsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const groups = await listMonitorGroups(db, teamId);
    return { groups };
  },
);

export const createMonitorGroupFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const created = await createMonitorGroup(db, teamId, data);
    return { ok: true, ...created };
  });

export const deleteMonitorGroupFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteMonitorGroup(db, teamId, data.id);
    return { ok: true };
  });

