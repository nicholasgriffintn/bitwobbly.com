import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "../lib/db";
import { requireTeam } from "../lib/auth-middleware";
import type { AvailabilityScopeType } from "../repositories/availability";
import {
  getExternalStatusPageBySlug,
  listComponentsForStatusPage,
} from "../repositories/status-pages";
import {
  isStatusPageUnlocked,
  useStatusPageSession,
} from "../lib/status-page-session";
import {
  getAvailabilityForScope,
  getMonthlyAvailabilityReport,
  getPublicAvailabilityForStatusPage,
} from "../services/availability";

const ScopeTypeSchema = z.enum(["monitor", "component", "status_page"]);

const GetAvailabilitySchema = z.object({
  scope_type: ScopeTypeSchema,
  scope_id: z.string().min(3),
  from: z.number(),
  to: z.number(),
  bucket: z.enum(["hour", "day"]).optional().default("day"),
  include_dependencies: z.boolean().optional().default(true),
});

export const getAvailabilityFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetAvailabilitySchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    return getAvailabilityForScope(db, teamId, {
      scopeType: data.scope_type as AvailabilityScopeType,
      scopeId: data.scope_id,
      fromSec: data.from,
      toSec: data.to,
      bucket: data.bucket,
      includeDependencies: data.include_dependencies,
    });
  });

const GetMonthlyReportSchema = z.object({
  scope_type: ScopeTypeSchema,
  scope_id: z.string().min(3),
  month: z.string(),
  format: z.enum(["json", "csv"]).optional().default("json"),
  include_dependencies: z.boolean().optional().default(true),
});

export const getMonthlyAvailabilityReportFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => GetMonthlyReportSchema.parse(data))
  .handler(async ({ data }) => {
    const { teamId } = await requireTeam();
    const vars = env;
    const db = getDb(vars.DB);

    const report = await getMonthlyAvailabilityReport(db, teamId, {
      scopeType: data.scope_type as AvailabilityScopeType,
      scopeId: data.scope_id,
      month: data.month,
      includeDependencies: data.include_dependencies,
    });

    if (data.format === "json") return { report };

    const lines: string[] = [];
    lines.push(
      [
        "date_utc",
        "uptime_percent",
        "downtime_minutes",
        "maintenance_minutes",
        "effective_minutes",
      ].join(","),
    );
    for (const day of report.days) {
      lines.push(
        [
          day.date,
          day.uptime_percent.toFixed(5),
          String(day.downtime_minutes),
          String(day.maintenance_minutes),
          String(day.effective_minutes),
        ].join(","),
      );
    }

    const csv = lines.join("\n");
    return {
      report,
      export: {
        content_type: "text/csv",
        filename: `availability_${report.scope.type}_${report.scope.id}_${data.month}.csv`,
        body: csv,
      },
    };
  });

const PublicAvailabilitySchema = z.object({
  slug: z.string().min(2),
  component_id: z.string().optional(),
  from: z.number().optional(),
  to: z.number().optional(),
  days: z.number().int().min(1).max(366).optional().default(90),
  bucket: z.enum(["day", "hour"]).optional().default("day"),
});

export const getPublicAvailabilityFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => PublicAvailabilitySchema.parse(data))
  .handler(async ({ data }) => {
    const vars = env;
    const db = getDb(vars.DB);

    const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
      key: `status_availability:${data.slug}`,
    });
    if (!success) throw new Error("Rate limit exceeded");

    const externalPage = await getExternalStatusPageBySlug(db, data.slug);
    if (!externalPage) throw notFound();

    if (externalPage.accessMode === "private") {
      const session = await useStatusPageSession();
      if (!isStatusPageUnlocked(session, data.slug)) {
        return { kind: "password_required" as const };
      }
    }

    if (data.component_id) {
      const comps = await listComponentsForStatusPage(db, externalPage.id);
      const allowed = comps.some((c) => c.id === data.component_id);
      if (!allowed) throw notFound();
    }

    const res = await getPublicAvailabilityForStatusPage(db, {
      slug: data.slug,
      componentId: data.component_id ?? null,
      fromSec: data.from ?? null,
      toSec: data.to ?? null,
      days: data.days,
      bucket: data.bucket,
    });
    if (res.kind === "not_found") throw notFound();
    return res;
  });
