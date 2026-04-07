export interface AiBinding {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  AI: AiBinding;
  SENTRY_DSN: string;
  GITHUB_TOKEN?: string;
}

export function assertEnv(env: Env): Env {
  const missing: string[] = [];
  if (!env.DB) missing.push("DB");
  if (!env.AI) missing.push("AI");
  if (!env.SENTRY_DSN) missing.push("SENTRY_DSN");

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return env;
}
