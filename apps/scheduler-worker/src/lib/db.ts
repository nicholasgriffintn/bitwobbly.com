import { createDb } from "@bitwobbly/shared";
import { instrumentD1WithSentry } from "@sentry/cloudflare";

export function getDb(d1: D1Database): ReturnType<typeof createDb> {
  return createDb(instrumentD1WithSentry(d1));
}
