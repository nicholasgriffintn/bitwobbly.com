import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { requireAuth } from "@bitwobbly/auth/server";

import { getDb } from "@bitwobbly/shared";
import { requireTeam } from "../lib/auth-middleware";
import { getSentryProject } from "../repositories/sentry-projects";
import { withCache, analyticsKey } from "../lib/cache";

import {
  getClockDriftStats,
  getErrorRateByRelease,
  getEventVolumeBySDK,
  getEventVolumeStats,
  getEventVolumeTimeseries,
  getEventVolumeTimeseriesBreakdown,
  getItemTypeDistribution,
  getSDKDistribution,
  getTopErrorMessages,
} from "../repositories/sentry-analytics";

export const getEventVolumeBySDKFn = createServerFn({ method: "GET" })
  .inputValidator((data: { startDate: string; endDate: string }) => data)
  .handler(async ({ data }) => {
    await requireAuth(getDb(env.DB));
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getEventVolumeBySDK(config, data.startDate, data.endDate);
  });

export const getClockDriftStatsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth(getDb(env.DB));
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getClockDriftStats(config);
  }
);

export const getItemTypeDistributionFn = createServerFn({ method: "GET" })
  .inputValidator((data: { startDate: string; endDate: string }) => data)
  .handler(async ({ data }) => {
    await requireAuth(getDb(env.DB));
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getItemTypeDistribution(config, data.startDate, data.endDate);
  });

export const getErrorRateByReleaseFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { projectId: string; startDate: string; endDate: string }) => data
  )
  .handler(async ({ data }) => {
    await requireAuth(getDb(env.DB));
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    const cacheKey = analyticsKey(
      "releases",
      project.sentryProjectId,
      data.startDate,
      data.endDate
    );
    return withCache(env.KV, cacheKey, () =>
      getErrorRateByRelease(
        config,
        project.sentryProjectId,
        data.startDate,
        data.endDate
      )
    );
  });

export const getTopErrorMessagesFn = createServerFn({ method: "GET" })
  .inputValidator((data: { projectId: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    await requireAuth(getDb(env.DB));
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    const cacheKey = `analytics:errors:${project.sentryProjectId}:${data.limit ?? 20}`;
    return withCache(env.KV, cacheKey, () =>
      getTopErrorMessages(config, project.sentryProjectId, data.limit)
    );
  });

export const getEventVolumeTimeseriesFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      projectId: string;
      startDate: string;
      endDate: string;
      interval?: "hour" | "day";
    }) => data
  )
  .handler(async ({ data }) => {
    await requireAuth(getDb(env.DB));
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getEventVolumeTimeseries(
      config,
      project.sentryProjectId,
      data.startDate,
      data.endDate,
      data.interval
    );
  });

export const getEventVolumeStatsFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { projectId: string; startDate: string; endDate: string }) => data
  )
  .handler(async ({ data }) => {
    await requireAuth(getDb(env.DB));
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    const cacheKey = analyticsKey(
      "stats",
      project.sentryProjectId,
      data.startDate,
      data.endDate
    );
    return withCache(env.KV, cacheKey, () =>
      getEventVolumeStats(
        config,
        project.sentryProjectId,
        data.startDate,
        data.endDate
      )
    );
  });

export const getEventVolumeTimeseriesBreakdownFn = createServerFn({
  method: "GET",
})
  .inputValidator(
    (data: {
      projectId: string;
      startDate: string;
      endDate: string;
      interval?: "hour" | "day";
    }) => data
  )
  .handler(async ({ data }) => {
    await requireAuth(getDb(env.DB));
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    const cacheKey = analyticsKey(
      "timeseries",
      project.sentryProjectId,
      data.startDate,
      data.endDate,
      data.interval
    );
    return withCache(env.KV, cacheKey, () =>
      getEventVolumeTimeseriesBreakdown(
        config,
        project.sentryProjectId,
        data.startDate,
        data.endDate,
        data.interval
      )
    );
  });

export const getSDKDistributionFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { projectId: string; startDate: string; endDate: string }) => data
  )
  .handler(async ({ data }) => {
    await requireAuth(getDb(env.DB));
    const { teamId } = await requireTeam();
    const db = getDb(env.DB);
    const project = await getSentryProject(db, teamId, data.projectId);
    if (!project) throw new Error("Project not found");
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    const cacheKey = analyticsKey(
      "sdk",
      project.sentryProjectId,
      data.startDate,
      data.endDate
    );
    return withCache(env.KV, cacheKey, () =>
      getSDKDistribution(
        config,
        project.sentryProjectId,
        data.startDate,
        data.endDate
      )
    );
  });
