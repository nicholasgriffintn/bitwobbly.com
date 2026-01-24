import type { DrizzleD1Database } from "drizzle-orm/d1";

import { validateSession } from "../repositories/auth";

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function err(status: number, message: string): Response {
  return json({ error: message }, { status });
}

export async function requireAuth(
  req: Request,
  db: DrizzleD1Database,
): Promise<{ userId: string } | Response> {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies: Record<string, string> = {};

  for (const cookie of cookieHeader.split(";")) {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  }

  const sessionToken = cookies.session_token;
  if (!sessionToken) {
    return err(401, "Authentication required.");
  }

  const session = await validateSession(db, sessionToken);
  if (!session) {
    return err(401, "Invalid or expired session.");
  }

  return { userId: session.userId };
}

export function getUrl(req: Request): URL {
  return new URL(req.url);
}

export async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body.");
  return JSON.parse(text) as T;
}

export function notFound(): Response {
  return err(404, "Not found.");
}
