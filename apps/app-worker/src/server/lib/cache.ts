const DEFAULT_TTL = 300;

export async function withCache<T>(
  kv: KVNamespace,
  cacheKey: string,
  fetchFn: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
): Promise<T> {
  const cached = await kv.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as T;
  }

  const result = await fetchFn();
  await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: ttl });
  return result;
}

export function analyticsKey(
  type: string,
  projectId: number,
  startDate: string,
  endDate: string,
  extra?: string,
): string {
  const start = startDate.split('T')[0];
  const end = endDate.split('T')[0];
  const base = `analytics:${type}:${projectId}:${start}:${end}`;
  return extra ? `${base}:${extra}` : base;
}
