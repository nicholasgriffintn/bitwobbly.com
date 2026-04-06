import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "@bitwobbly/shared";
import { verifyPassword } from "../lib/auth";
import {
  getExternalStatusPageBySlug,
} from "../repositories/status-pages";
import {
  isStatusPageUnlocked,
  unlockStatusPage,
  useStatusPageSession,
} from "../lib/status-page-session";
import {
  rebuildStatusSnapshot,
  type StatusSnapshot,
} from "../services/status-snapshots";
import { requireTeam } from "../lib/auth-middleware";

type PublicStatusPasswordRequired = {
  kind: "password_required";
  page: {
    name: string;
    logo_url: string | null;
    brand_color: string | null;
  };
};

export type PublicStatusResult =
  | { kind: "snapshot"; snapshot: StatusSnapshot }
  | PublicStatusPasswordRequired;

type StatusComponent = StatusSnapshot["components"][number];
type StatusIncident = StatusSnapshot["incidents"][number];

export type PublicStatusCoreSnapshot = Pick<StatusSnapshot, "generated_at" | "page"> & {
  components: Array<Omit<StatusComponent, "historical_data" | "overall_uptime">>;
  incidents: StatusIncident[];
};

export type PublicStatusCoreResult =
  | { kind: "snapshot"; snapshot: PublicStatusCoreSnapshot }
  | PublicStatusPasswordRequired;

export type PublicStatusDeferredDetails = {
  components: Array<
    Pick<StatusComponent, "id" | "historical_data" | "overall_uptime">
  >;
  pastIncidents: StatusIncident[];
};

type StatusLoadOptions = {
  includeHistoricalData: boolean;
  includePastIncidents: boolean;
  enforceRateLimit: boolean;
  useCache: boolean;
};

function toCoreSnapshot(snapshot: StatusSnapshot): PublicStatusCoreSnapshot {
  return {
    generated_at: snapshot.generated_at,
    page: snapshot.page,
    components: snapshot.components.map(
      ({ historical_data: _historical, overall_uptime: _uptime, ...rest }) =>
        rest
    ),
    incidents: snapshot.incidents.filter((incident) => incident.status !== "resolved"),
  };
}

function toDeferredDetails(snapshot: StatusSnapshot): PublicStatusDeferredDetails {
  return {
    components: snapshot.components.map((component) => ({
      id: component.id,
      historical_data: component.historical_data,
      overall_uptime: component.overall_uptime,
    })),
    pastIncidents: snapshot.incidents.filter(
      (incident) => incident.status === "resolved"
    ),
  };
}

async function loadPublicStatus(
  data: { slug: string },
  options: StatusLoadOptions
): Promise<PublicStatusResult> {
  const vars = env;

  if (options.enforceRateLimit) {
    const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
      key: `status_page:${data.slug}`,
    });
    if (!success) {
      throw new Error("Rate limit exceeded");
    }
  }

  const db = getDb(vars.DB);

  const externalPage = await getExternalStatusPageBySlug(db, data.slug);
  if (externalPage) {
    if (externalPage.accessMode === "private") {
      const session = await useStatusPageSession();
      if (!isStatusPageUnlocked(session, data.slug)) {
        return {
          kind: "password_required",
          page: {
            name: externalPage.name,
            logo_url: externalPage.logoUrl,
            brand_color: externalPage.brandColor,
          },
        };
      }
    }

    const snapshot = await rebuildStatusSnapshot(
      db,
      vars.KV,
      data.slug,
      options.includeHistoricalData ? vars.CLOUDFLARE_ACCOUNT_ID : undefined,
      options.includeHistoricalData ? vars.CLOUDFLARE_API_TOKEN : undefined,
      {
        includeHistoricalData: options.includeHistoricalData,
        includePastIncidents: options.includePastIncidents,
        useCache: options.useCache,
      }
    );

    if (!snapshot) {
      throw notFound();
    }

    return { kind: "snapshot", snapshot };
  }

  const { teamId } = await requireTeam();
  const snapshot = await rebuildStatusSnapshot(
    db,
    vars.KV,
    data.slug,
    options.includeHistoricalData ? vars.CLOUDFLARE_ACCOUNT_ID : undefined,
    options.includeHistoricalData ? vars.CLOUDFLARE_API_TOKEN : undefined,
    {
      teamId,
      includePrivate: true,
      includeHistoricalData: options.includeHistoricalData,
      includePastIncidents: options.includePastIncidents,
      useCache: options.useCache,
    }
  );

  if (!snapshot) {
    throw notFound();
  }

  return { kind: "snapshot", snapshot };
}

export const getPublicStatusFn = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => {
    return data;
  })
  .handler(async ({ data }): Promise<PublicStatusResult> => {
    return loadPublicStatus(data, {
      includeHistoricalData: true,
      includePastIncidents: true,
      enforceRateLimit: true,
      useCache: true,
    });
  });

export const getPublicStatusCoreFn = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }): Promise<PublicStatusCoreResult> => {
    const result = await loadPublicStatus(data, {
      includeHistoricalData: false,
      includePastIncidents: false,
      enforceRateLimit: true,
      useCache: false,
    });

    if (result.kind === "password_required") {
      return result;
    }

    return { kind: "snapshot", snapshot: toCoreSnapshot(result.snapshot) };
  });

export const getPublicStatusDeferredDetailsFn = createServerFn({
  method: "GET",
})
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }): Promise<PublicStatusDeferredDetails> => {
    const result = await loadPublicStatus(data, {
      includeHistoricalData: true,
      includePastIncidents: true,
      enforceRateLimit: false,
      useCache: true,
    });

    if (result.kind === "password_required") {
      throw new Error("Status page requires a password");
    }

    return toDeferredDetails(result.snapshot);
  });

const UnlockPrivateStatusPageSchema = z.object({
  slug: z.string(),
  password: z.string().min(1),
});

export const unlockPrivateStatusPageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UnlockPrivateStatusPageSchema.parse(data))
  .handler(async ({ data }) => {
    const vars = env;
    const db = getDb(vars.DB);

    const { success } = await vars.STATUS_PAGE_RATE_LIMITER.limit({
      key: `status_page_unlock:${data.slug}`,
    });
    if (!success) {
      throw new Error("Rate limit exceeded");
    }

    const page = await getExternalStatusPageBySlug(db, data.slug);
    if (!page || page.accessMode !== "private") {
      throw notFound();
    }

    if (!page.passwordHash) {
      throw new Error("This status page is missing a password");
    }

    const ok = await verifyPassword(data.password, page.passwordHash);
    if (!ok) {
      throw new Error("Invalid password");
    }

    const session = await useStatusPageSession();
    await unlockStatusPage(session, data.slug);
    return { ok: true };
  });
