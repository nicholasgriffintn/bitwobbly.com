export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function err(status: number, message: string): Response {
  return json({ error: message }, { status });
}

export function requireAdmin(req: Request, adminToken?: string): Response | null {
  if (!adminToken) return err(500, "ADMIN_API_TOKEN not configured.");
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== adminToken) return err(401, "Unauthorized.");
  return null;
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
