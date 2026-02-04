export const STATUS_PAGE_UNLOCK_TTL_SECONDS = 24 * 60 * 60;

export function isStatusPageUnlocked(
  unlocked: Record<string, number> | undefined,
  slug: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const unlockedAt = unlocked?.[slug];
  if (!unlockedAt) return false;
  return nowSec - unlockedAt <= STATUS_PAGE_UNLOCK_TTL_SECONDS;
}

export function nextUnlockedMap(
  unlocked: Record<string, number> | undefined,
  slug: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Record<string, number> {
  const next = { ...(unlocked || {}) };
  next[slug] = nowSec;

  // Avoid unbounded cookie growth.
  const entries = Object.entries(next).sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, 25));
}

