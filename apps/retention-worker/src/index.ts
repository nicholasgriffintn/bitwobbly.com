import * as Sentry from "@sentry/cloudflare";
import { serialiseError, createLogger } from "@bitwobbly/shared";

import { getIssueRetentionConfig } from "./lib/retention-config.ts";
import { runIssueRetention } from "./lib/retention-runner.ts";
import type { Env } from "./types/env.ts";
import { assertEnv } from "./types/env.ts";

const logger = createLogger({ service: "retention-worker" });

const handler = {
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    assertEnv(env);

    await Sentry.withMonitor(
      "issue-retention",
      async () => {
        const config = getIssueRetentionConfig(env);
        const scheduledAt = new Date(event.scheduledTime);

        try {
          await runIssueRetention(env, config, scheduledAt);
        } catch (error) {
          logger.error("issue retention failed", {
            error: serialiseError(error),
          });
          throw error;
        }
      },
      {
        schedule: { type: "crontab", value: event.cron },
        checkinMargin: 60,
        maxRuntime: 15,
        timezone: "UTC",
      }
    );
  },
};

export default Sentry.withSentry<Env>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: "production",
    sampleRate: 1,
    enableLogs: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      return event.exception?.values?.length ? event : null;
    },
    beforeSendTransaction() {
      return null;
    },
  }),
  handler
);
