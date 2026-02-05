import { withSentry } from "@sentry/cloudflare";
import {
  CACHE_TTL,
  getDb,
  createLogger,
  serialiseError,
} from "@bitwobbly/shared";

import { parseEnvelope } from "./lib/envelope";
import { buildManifests } from "./lib/manifest";
import { isProjectCache } from "./lib/guards";
import { validateDsn } from "./repositories/auth";
import { PayloadTooLargeError, readBodyWithLimit } from "./lib/request-utils";
import type { Env } from "./types/env";
import { assertEnv } from "./types/env";

const logger = createLogger({ service: "sentry-ingest-worker" });

const MAX_ENVELOPE_BYTES = 5 * 1024 * 1024;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Sentry-Auth",
};

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    assertEnv(env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    const match = url.pathname.match(/^\/api\/(\d+)\/envelope\/?$/);
    if (!match || request.method !== "POST") {
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    }

    const sentryProjectId = parseInt(match[1], 10);

    try {
      const publicKey = extractPublicKey(request);
      if (!publicKey) {
        return new Response("Missing authentication", {
          status: 401,
          headers: CORS_HEADERS,
        });
      }

      const cacheKey = `dsn:${sentryProjectId}:${publicKey}`;
      let project: { id: string; teamId: string } | null = null;

      const cached = await env.KV.get(cacheKey, "json");
      if (isProjectCache(cached)) {
        project = cached;
      } else {
        const db = getDb(env.DB, { withSentry: true });
        project = await validateDsn(db, sentryProjectId, publicKey);

        if (project) {
          await env.KV.put(cacheKey, JSON.stringify(project), {
            expirationTtl: CACHE_TTL.DSN_VALIDATION,
          });
        }
      }

      if (!project) {
        return new Response("Invalid DSN", {
          status: 401,
          headers: CORS_HEADERS,
        });
      }

      const { success } = await env.SENTRY_RATE_LIMITER.limit({
        key: `sentry_project:${project.id}`,
      });

      if (!success) {
        return new Response("Rate limit exceeded", {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            "X-RateLimit-Limit": "1000",
            "Retry-After": "60",
          },
        });
      }

      let body: Uint8Array;
      try {
        body = await readBodyWithLimit(request, MAX_ENVELOPE_BYTES);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          return new Response("Payload too large", {
            status: 413,
            headers: CORS_HEADERS,
          });
        }
        throw error;
      }

      const now = new Date();
      const r2Key = `raw/${sentryProjectId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${crypto.randomUUID()}.envelope`;

      await env.SENTRY_RAW.put(r2Key, body);

      const envelope = parseEnvelope(body);
      const manifests = buildManifests(
        envelope,
        project.id,
        sentryProjectId,
        r2Key,
        now
      );

      await env.SENTRY_PIPELINE.send(manifests);

      for (const manifest of manifests) {
        if (
          manifest.item_type === "event" ||
          manifest.item_type === "transaction" ||
          manifest.item_type === "session" ||
          manifest.item_type === "sessions" ||
          manifest.item_type === "client_report"
        ) {
          await env.SENTRY_EVENTS.send({
            manifest_id: manifest.manifest_id,
            sentry_project_id: manifest.sentry_project_id,
            project_id: manifest.project_id,
            received_at: manifest.received_at,
            item_type: manifest.item_type,
            event_id: manifest.event_id,
            r2_raw_key: manifest.r2_raw_key,
            item_index: manifest.item_index,
          });
        }
      }

      return new Response(JSON.stringify({ id: envelope.header.event_id }), {
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (error) {
      logger.error("Error:", { error: serialiseError(error) });
      return new Response("Internal Error", {
        status: 500,
        headers: CORS_HEADERS,
      });
    }
  },
};

export default withSentry<Env>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.2,
    beforeSend(event) {
      // Drop all error events to prevent infinite recursion.
      // This worker ingests Sentry events, so sending its own errors
      // to Sentry would create a feedback loop.
      return null;
    },
  }),
  handler
);

function extractPublicKey(request: Request): string | null {
  const authHeader = request.headers.get("X-Sentry-Auth");
  if (authHeader) {
    const match = authHeader.match(/sentry_key=([^,\s]+)/);
    if (match) return match[1];
  }

  const url = new URL(request.url);
  return url.searchParams.get("sentry_key");
}
