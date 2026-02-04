import { nowIso, schema, sha256Hex, type DB } from "@bitwobbly/shared";
import { and, eq } from "drizzle-orm";

export async function getStatusPageSubscriberById(
  db: DB,
  subscriberId: string
) {
  const rows = await db
    .select()
    .from(schema.statusPageSubscribers)
    .where(eq(schema.statusPageSubscribers.id, subscriberId))
    .limit(1);
  return rows[0] || null;
}

export async function getStatusPageNameAndSlug(db: DB, statusPageId: string) {
  const rows = await db
    .select({ name: schema.statusPages.name, slug: schema.statusPages.slug })
    .from(schema.statusPages)
    .where(eq(schema.statusPages.id, statusPageId))
    .limit(1);
  return rows[0] || null;
}

export async function activateWebhookSubscriberIfTokenValid(
  db: DB,
  input: {
    subscriberId: string;
    confirmToken: string;
    nowSec: number;
  }
): Promise<boolean> {
  const tokenHash = await sha256Hex(input.confirmToken);

  const rows = await db
    .select({
      id: schema.statusPageSubscribers.id,
      confirmExpiresAt: schema.statusPageSubscribers.confirmExpiresAt,
    })
    .from(schema.statusPageSubscribers)
    .where(
      and(
        eq(schema.statusPageSubscribers.id, input.subscriberId),
        eq(schema.statusPageSubscribers.confirmTokenHash, tokenHash)
      )
    )
    .limit(1);

  const match = rows[0];
  const expiresAt = Number(match?.confirmExpiresAt || 0);
  if (!match || !expiresAt || expiresAt < input.nowSec) {
    return false;
  }

  await db
    .update(schema.statusPageSubscribers)
    .set({
      status: "active",
      confirmedAt: nowIso(),
      confirmTokenHash: null,
      confirmExpiresAt: null,
      unsubscribedAt: null,
    })
    .where(eq(schema.statusPageSubscribers.id, input.subscriberId));

  return true;
}
