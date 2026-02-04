import type { DB } from '@bitwobbly/shared';

import type { Env } from '../types/env';
import {
  listActiveDigestSubscribers,
  listUnsentSubscriberEventIds,
} from '../repositories/status-page-digests';

export async function runStatusPageDigests(
  db: DB,
  env: Env,
  ctx: ExecutionContext,
) {
  const now = new Date();
  const minute = now.getUTCMinutes();
  const hour = now.getUTCHours();

  if (minute !== 0 || hour !== 9) return;

  const dayKey = now.toISOString().slice(0, 10);

  ctx.waitUntil(enqueueDigestForCadence(db, env, 'daily', `daily:${dayKey}`));

  const isMonday = now.getUTCDay() === 1;
  if (isMonday) {
    const weekStartKey = getUtcWeekStartKey(now);
    ctx.waitUntil(
      enqueueDigestForCadence(db, env, 'weekly', `weekly:${weekStartKey}`),
    );
  }
}

function getUtcWeekStartKey(now: Date): string {
  const day = now.getUTCDay();
  const delta = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - delta);
  return monday.toISOString().slice(0, 10);
}

async function enqueueDigestForCadence(
  db: DB,
  env: Env,
  cadence: 'daily' | 'weekly',
  windowKey: string,
) {
  const subs = await listActiveDigestSubscribers(db, cadence);
  if (!subs.length) return;

  const maxEventsPerSubscriber = 200;
  const chunkSize = 50;

  for (const sub of subs) {
    const eventIds = await listUnsentSubscriberEventIds(
      db,
      sub.id,
      maxEventsPerSubscriber,
    );

    if (!eventIds.length) continue;

    for (let start = 0; start < eventIds.length; start += chunkSize) {
      const chunk = eventIds.slice(start, start + chunkSize);
      const chunkIndex = Math.floor(start / chunkSize);
      const jobId = `spdigest:${windowKey}:${sub.id}:${chunkIndex}`;

      await env.ALERT_JOBS.send({
        type: 'status_page_deliver_events',
        job_id: jobId,
        subscriber_id: sub.id,
        event_ids: chunk,
        is_digest: true,
      });
    }
  }
}
