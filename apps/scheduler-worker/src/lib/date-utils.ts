export function getUtcWeekStartKey(now: Date): string {
  const day = now.getUTCDay();
  const delta = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  monday.setUTCDate(monday.getUTCDate() - delta);
  return monday.toISOString().slice(0, 10);
}
