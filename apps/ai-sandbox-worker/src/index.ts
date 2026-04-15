import {
  createLogger,
  parseAiActionWorkerMessage,
  serialiseError,
} from "@bitwobbly/shared";
import { withSentry } from "@sentry/cloudflare";

import { handleCommandMessage } from "./lib/command-handler";
import { handleTriggerMessage } from "./lib/trigger-handler";
import type { Env } from "./types/env";
import { assertEnv } from "./types/env";

const logger = createLogger({ service: "ai-sandbox-worker" });

const ENABLED = false;

const handler = {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    if (!ENABLED) {
      logger.info("AI sandbox worker is disabled, skipping batch");
      return;
    }


    assertEnv(env);

    for (const message of batch.messages) {
      try {
        const payload = parseAiActionWorkerMessage(message.body);
        if (payload.kind === "trigger") {
          await handleTriggerMessage(env, payload.trigger);
        } else {
          await handleCommandMessage(env, payload.command);
        }
        message.ack();
      } catch (error) {
        logger.error("sandbox queue job failed", {
          error: serialiseError(error),
          body: message.body,
        });
      }
    }
  },
};

export default withSentry<Env, unknown>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.2,
  }),
  handler
);
