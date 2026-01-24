export type ApiError = {
  error: string;
};

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) {
    headers.set("authorization", `Bearer ${init.token}`);
  }
  const res = await fetch(input, { ...init, credentials: "include", headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (json as ApiError | null)?.error || res.statusText;
    throw new Error(err);
  }
  return json;
}
