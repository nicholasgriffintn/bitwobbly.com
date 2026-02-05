import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "@bitwobbly/shared";
import { requireTeam } from "../lib/auth-middleware";
import {
  createSuppression,
  deleteSuppression,
  listSuppressions,
} from "../repositories/suppressions";
import { clearAllStatusPageCaches } from "../services/status-snapshots";

const ScopeTypeSchema = z.enum(["monitor", "monitor_group", "component"]);
const KindSchema = z.enum(["maintenance", "silence"]);

const CreateSuppressionSchema = z
  .object({
    kind: KindSchema,
    name: z.string().min(1),
    reason: z.string().optional(),
    starts_at: z.number().int(),
    ends_at: z.number().int().nullable().optional(),
    scopes: z
      .array(
        z.object({
          scope_type: ScopeTypeSchema,
          scope_id: z.string().min(1),
        })
      )
      .min(1),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "maintenance") {
      if (data.ends_at == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Maintenance windows require an end time",
          path: ["ends_at"],
        });
      }
    }
    if (data.ends_at != null && data.ends_at <= data.starts_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time must be after start time",
        path: ["ends_at"],
      });
    }
  });

export const listSuppressionsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    const suppressions = await listSuppressions(db, teamId);
    return { suppressions };
  }
);

export const createSuppressionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => CreateSuppressionSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const created = await createSuppression(db, teamId, {
      kind: data.kind,
      name: data.name,
      reason: data.reason,
      startsAt: data.starts_at,
      endsAt: data.ends_at ?? null,
      scopes: data.scopes.map((s) => ({
        scopeType: s.scope_type,
        scopeId: s.scope_id,
      })),
    });

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true, ...created };
  });

export const deleteSuppressionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);
    await deleteSuppression(db, teamId, data.id);

    await clearAllStatusPageCaches(db, vars.KV, teamId);

    return { ok: true };
  });
