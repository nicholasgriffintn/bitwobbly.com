import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { getDb } from "@bitwobbly/shared";

import {
  getExternalStatusPageBySlug,
  listComponentsForStatusPage,
} from "@/server/repositories/status-pages";
import {
  isStatusPageUnlocked,
  useStatusPageSession,
} from "@/server/lib/status-page-session";
import { getMonthlyAvailabilityReport } from "@/server/services/availability";

const QuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  component_id: z.string().optional(),
  format: z.enum(["json", "csv"]).optional().default("json"),
});

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const Route = createFileRoute(
  "/api/status/$slug/reports/availability/monthly"
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const vars = env;
          const db = getDb(vars.DB);

          const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
            key: `status_report_monthly:${params.slug}`,
          });
          if (!success) {
            return Response.json(
              { ok: false, error: "Rate limit exceeded" },
              { status: 429, headers: { "Retry-After": "60" } }
            );
          }

          const page = await getExternalStatusPageBySlug(db, params.slug);
          if (!page) {
            return Response.json(
              { ok: false, error: "Not found" },
              { status: 404 }
            );
          }

          if (page.accessMode === "private") {
            const session = await useStatusPageSession();
            if (!isStatusPageUnlocked(session, params.slug)) {
              return Response.json(
                { ok: false, error: "password_required" },
                { status: 401 }
              );
            }
          }

          const url = new URL(request.url);
          const query = Object.fromEntries(url.searchParams.entries());
          const data = QuerySchema.parse(query);

          let scopeType: "status_page" | "component" = "status_page";
          let scopeId = page.id;

          if (data.component_id) {
            const comps = await listComponentsForStatusPage(db, page.id);
            const allowed = comps.some((c) => c.id === data.component_id);
            if (!allowed) {
              return Response.json(
                { ok: false, error: "Not found" },
                { status: 404 }
              );
            }
            scopeType = "component";
            scopeId = data.component_id;
          }

          const report = await getMonthlyAvailabilityReport(db, page.teamId, {
            scopeType,
            scopeId,
            month: data.month,
            includeDependencies: true,
          });

          if (data.format === "json") {
            return Response.json({ ok: true, report });
          }

          const lines: string[] = [];
          lines.push(
            [
              "date_utc",
              "uptime_percent",
              "downtime_minutes",
              "maintenance_minutes",
              "effective_minutes",
            ].join(",")
          );
          for (const day of report.days) {
            lines.push(
              [
                csvEscape(day.date),
                day.uptime_percent.toFixed(5),
                String(day.downtime_minutes),
                String(day.maintenance_minutes),
                String(day.effective_minutes),
              ].join(",")
            );
          }
          const csv = lines.join("\n");

          const filename = `availability_${report.scope.type}_${report.scope.id}_${report.month}.csv`;
          return new Response(csv, {
            status: 200,
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": `attachment; filename=${filename}`,
              "cache-control": "no-store",
            },
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json(
              { ok: false, error: "Invalid query params" },
              { status: 400 }
            );
          }
          return Response.json(
            { ok: false, error: "Internal server error" },
            { status: 500 }
          );
        }
      },
    },
  },
});
