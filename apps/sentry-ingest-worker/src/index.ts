import { getDb } from "./lib/db";
import { parseEnvelope } from "./lib/envelope";
import { buildManifests } from "./lib/manifest";
import { validateDsn } from "./repositories/auth";
import type { Env } from "./types/env";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const match = url.pathname.match(/^\/api\/(\d+)\/envelope\/?$/);
    if (!match || request.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    const sentryProjectId = parseInt(match[1], 10);

    try {
      const publicKey = extractPublicKey(request);
      if (!publicKey) {
        return new Response("Missing authentication", { status: 401 });
      }

      const cacheKey = `dsn:${sentryProjectId}:${publicKey}`;
      let project: { id: string; teamId: string } | null = null;

      const cached = await env.KV.get(cacheKey, 'json');
      if (cached) {
        project = cached as { id: string; teamId: string };
      } else {
        const db = getDb(env.DB);
        project = await validateDsn(db, sentryProjectId, publicKey);

        if (project) {
          await env.KV.put(cacheKey, JSON.stringify(project), {
            expirationTtl: 300,
          });
        }
      }

      if (!project) {
        return new Response("Invalid DSN", { status: 401 });
      }

      const body = new Uint8Array(await request.arrayBuffer());

      const now = new Date();
      const r2Key = `raw/${sentryProjectId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${crypto.randomUUID()}.envelope`;

      await env.SENTRY_RAW.put(r2Key, body);

      const envelope = parseEnvelope(body);
      const manifests = buildManifests(
        envelope,
        project.id,
        sentryProjectId,
        r2Key,
      );

      await env.SENTRY_PIPELINE.send(manifests);

      for (const manifest of manifests) {
        if (
          manifest.item_type === "event" ||
          manifest.item_type === "transaction"
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
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[SENTRY-INGEST] Error:", error);
      return new Response("Internal Error", { status: 500 });
    }
  },
};

function extractPublicKey(request: Request): string | null {
  const authHeader = request.headers.get("X-Sentry-Auth");
  if (authHeader) {
    const match = authHeader.match(/sentry_key=([^,\s]+)/);
    if (match) return match[1];
  }

  const url = new URL(request.url);
  return url.searchParams.get("sentry_key");
}
