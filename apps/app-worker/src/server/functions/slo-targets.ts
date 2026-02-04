import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { getDb } from "../lib/db";
import { requireTeam } from "../lib/auth-middleware";
import { percentToPpm, ppmToPercent } from "../lib/availability";
import { getEffectiveSloTarget, upsertSloTarget } from "../repositories/slo-targets";
import { resolveAvailabilityScope, type AvailabilityScopeType } from "../repositories/availability";

const ScopeTypeSchema = z.enum(["monitor", "component", "status_page"]);

const GetSloTargetSchema = z.object({
  scope_type: ScopeTypeSchema,
  scope_id: z.string().min(3),
});

export const getSloTargetFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetSloTargetSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const scope = await resolveAvailabilityScope(db, teamId, {
      type: data.scope_type as AvailabilityScopeType,
      id: data.scope_id,
      includeDependencies: false,
    });

    const target = await getEffectiveSloTarget(
      db,
      teamId,
      scope.scope.type,
      scope.scope.id,
    );

    return {
      scope: scope.scope,
      slo: target.slo
        ? {
            source: target.source,
            target_ppm: target.slo.targetPpm,
            target_percent: ppmToPercent(target.slo.targetPpm),
          }
        : null,
    };
  });

const UpsertSloTargetSchema = z.object({
  scope_type: ScopeTypeSchema,
  scope_id: z.string().min(3),
  target_percent: z.number().min(0).max(100),
});

export const upsertSloTargetFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UpsertSloTargetSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const scope = await resolveAvailabilityScope(db, teamId, {
      type: data.scope_type as AvailabilityScopeType,
      id: data.scope_id,
      includeDependencies: false,
    });

    const targetPpm = percentToPpm(data.target_percent);
    await upsertSloTarget(db, teamId, scope.scope.type, scope.scope.id, targetPpm);

    return { ok: true, scope: scope.scope, target_ppm: targetPpm, target_percent: ppmToPercent(targetPpm) };
  });
