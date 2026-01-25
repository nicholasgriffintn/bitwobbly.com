import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { requireAuth } from "../lib/auth-middleware";
import {
  getClockDriftStats,
  getErrorRateByRelease,
  getEventVolumeBySDK,
  getEventVolumeTimeseries,
  getItemTypeDistribution,
  getTopErrorMessages,
} from "../repositories/sentry-analytics";

export const getEventVolumeBySDKFn = createServerFn({ method: "GET" })
  .inputValidator((data: { startDate: string; endDate: string }) => data)
  .handler(async ({ data }) => {
    await requireAuth();
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getEventVolumeBySDK(config, data.startDate, data.endDate);
  });

export const getClockDriftStatsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getClockDriftStats(config);
  },
);

export const getItemTypeDistributionFn = createServerFn({ method: "GET" })
  .inputValidator((data: { startDate: string; endDate: string }) => data)
  .handler(async ({ data }) => {
    await requireAuth();
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getItemTypeDistribution(config, data.startDate, data.endDate);
  });

export const getErrorRateByReleaseFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { projectId: number; startDate: string; endDate: string }) => data,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getErrorRateByRelease(
      config,
      data.projectId,
      data.startDate,
      data.endDate,
    );
  });

export const getTopErrorMessagesFn = createServerFn({ method: "GET" })
  .inputValidator((data: { projectId: number; limit?: number }) => data)
  .handler(async ({ data }) => {
    await requireAuth();
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getTopErrorMessages(config, data.projectId, data.limit);
  });

export const getEventVolumeTimeseriesFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      projectId: number;
      startDate: string;
      endDate: string;
      interval?: "hour" | "day";
    }) => data,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const config = {
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      authToken: env.CLOUDFLARE_API_TOKEN,
    };
    return getEventVolumeTimeseries(
      config,
      data.projectId,
      data.startDate,
      data.endDate,
      data.interval,
    );
  });
