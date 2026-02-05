import type { CheckJob } from "@bitwobbly/shared";
import {
  instrumentDurableObjectWithSentry,
  withSentry,
} from "@sentry/cloudflare";
import { getDb, createLogger, serialiseError } from "@bitwobbly/shared";

import {
  rebuildAllSnapshots,
  openIncident,
  resolveIncident,
} from "./repositories/snapshot";
import type { Env } from "./types/env";
import { assertEnv } from "./types/env";
import { jsonResponse } from "./lib/responses";
import { parseTransitionRequest } from "./lib/transition-request";
import { handleCheck } from "./lib/check-processing";

const logger = createLogger({ service: "checker-worker" });

type DOState = {
  open_incident_id?: string;
};

class IncidentCoordinatorBase implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    assertEnv(this.env);
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/transition")
      return new Response("Not found", { status: 404 });

    const body = await req.json();
    const input = parseTransitionRequest(body);
    if (!input) {
      return jsonResponse({ ok: false, error: "Invalid request body" }, 400);
    }
    const current = (await this.state.storage.get<DOState>("s")) || {};

    if (input.status === "down") {
      if (current.open_incident_id)
        return jsonResponse({
          ok: true,
          incident_id: current.open_incident_id,
          action: "noop_already_open",
        });

      const incidentId = await openIncident(
        { DB: this.env.DB },
        input.team_id,
        input.monitor_id,
        input.reason
      );
      await this.state.storage.put<DOState>("s", {
        open_incident_id: incidentId,
      });

      await rebuildAllSnapshots({
        DB: this.env.DB,
        KV: this.env.KV,
      });

      return jsonResponse({
        ok: true,
        incident_id: incidentId,
        action: "opened",
      });
    }

    if (!current.open_incident_id)
      return jsonResponse({ ok: true, action: "noop_no_open_incident" });

    const incidentId = current.open_incident_id;
    await resolveIncident({ DB: this.env.DB }, input.monitor_id, incidentId);
    await this.state.storage.put<DOState>("s", {});

    await rebuildAllSnapshots({
      DB: this.env.DB,
      KV: this.env.KV,
    });

    return jsonResponse({
      ok: true,
      incident_id: incidentId,
      action: "resolved",
    });
  }
}

const handler = {
  async queue(
    batch: MessageBatch<CheckJob>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    assertEnv(env);
    const db = getDb(env.DB, { withSentry: true });

    for (const msg of batch.messages) {
      try {
        await handleCheck(msg.body, env, ctx, db);
        msg.ack();
      } catch (e: unknown) {
        logger.error("[CHECKER] check failed", { error: serialiseError(e) });
      }
    }
  },
};

export default withSentry<Env, CheckJob>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 1.0,
  }),
  handler
);

export const IncidentCoordinator = instrumentDurableObjectWithSentry<
  Env,
  any,
  typeof IncidentCoordinatorBase
>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.2,
  }),
  IncidentCoordinatorBase
);
