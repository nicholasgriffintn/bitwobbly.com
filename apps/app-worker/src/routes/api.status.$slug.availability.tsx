import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { env } from "cloudflare:workers";

import { getDb } from "@/server/lib/db";
import { getExternalStatusPageBySlug } from "@/server/repositories/status-pages";
import {
  isStatusPageUnlocked,
  useStatusPageSession,
} from "@/server/lib/status-page-session";
import { getPublicAvailabilityForStatusPage } from "@/server/services/availability";

const QuerySchema = z.object({
  component_id: z.string().optional(),
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional(),
  days: z.coerce.number().int().min(1).max(366).optional().default(90),
  bucket: z.enum(["day", "hour"]).optional().default("day"),
});

export const Route = createFileRoute("/api/status/$slug/availability")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const vars = env;
          const db = getDb(vars.DB);

          const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
            key: `status_availability:${params.slug}`,
          });
          if (!success) {
            return Response.json(
              { ok: false, error: "Rate limit exceeded" },
              { status: 429, headers: { "Retry-After": "60" } },
            );
          }

          const page = await getExternalStatusPageBySlug(db, params.slug);
          if (!page) {
            return Response.json({ ok: false, error: "Not found" }, { status: 404 });
          }

          if (page.accessMode === "private") {
            const session = await useStatusPageSession();
            if (!isStatusPageUnlocked(session, params.slug)) {
              return Response.json(
                { ok: false, error: "password_required" },
                { status: 401 },
              );
            }
          }

          const url = new URL(request.url);
          const query = Object.fromEntries(url.searchParams.entries());
          const data = QuerySchema.parse(query);

          const res = await getPublicAvailabilityForStatusPage(db, {
            slug: params.slug,
            componentId: data.component_id ?? null,
            fromSec: data.from ?? null,
            toSec: data.to ?? null,
            days: data.days,
            bucket: data.bucket,
          });
          if (res.kind === "not_found") {
            return Response.json({ ok: false, error: "Not found" }, { status: 404 });
          }

          return Response.json({ ok: true, ...res });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json(
              { ok: false, error: "Invalid query params" },
              { status: 400 },
            );
          }
          return Response.json(
            { ok: false, error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});

