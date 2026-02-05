export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  SESSION_SECRET?: string;
  SENTRY_DSN: string;
}

export function assertEnv(env: Env): Env {
  const missing: string[] = [];
  if (!env.DB) missing.push("DB");
  if (!env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!env.SENTRY_DSN) missing.push("SENTRY_DSN");

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  return env;
}
