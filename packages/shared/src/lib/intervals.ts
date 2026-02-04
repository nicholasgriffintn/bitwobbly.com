export type Interval = { start: number; end: number };

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const cleaned = intervals
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end))
    .map((i) => ({ start: Math.floor(i.start), end: Math.floor(i.end) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => (a.start !== b.start ? a.start - b.start : a.end - b.end));

  const merged: Interval[] = [];
  for (const interval of cleaned) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(interval);
      continue;
    }

    if (interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
      continue;
    }

    merged.push(interval);
  }
  return merged;
}

export function clampIntervals(
  intervals: Interval[],
  range: Interval
): Interval[] {
  const clamped: Interval[] = [];
  for (const interval of intervals) {
    const start = Math.max(interval.start, range.start);
    const end = Math.min(interval.end, range.end);
    if (end > start) clamped.push({ start, end });
  }
  return clamped;
}

export function sumIntervalSeconds(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0);
}

export function subtractIntervals(
  base: Interval[],
  subtract: Interval[]
): Interval[] {
  const a = mergeIntervals(base);
  const b = mergeIntervals(subtract);
  if (!a.length) return [];
  if (!b.length) return a;

  const out: Interval[] = [];
  let j = 0;

  for (const interval of a) {
    let cursor = interval.start;

    while (j < b.length && b[j].end <= interval.start) j++;

    let k = j;
    while (k < b.length && b[k].start < interval.end) {
      const cut = b[k];
      if (cut.start > cursor) {
        out.push({ start: cursor, end: Math.min(cut.start, interval.end) });
      }
      cursor = Math.max(cursor, cut.end);
      if (cursor >= interval.end) break;
      k++;
    }

    if (cursor < interval.end) out.push({ start: cursor, end: interval.end });
  }

  return out;
}

export function sumOverlapSeconds(
  intervals: Interval[],
  range: Interval
): number {
  const merged = mergeIntervals(clampIntervals(intervals, range));
  return sumIntervalSeconds(merged);
}
