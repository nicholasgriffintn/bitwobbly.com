import { serialiseError } from "@bitwobbly/shared";

import type { DB } from "@bitwobbly/shared";
import { recordNotificationDeliveryAttempt } from "../repositories/notification-delivery-attempts";

export interface DeliveryAuditContext {
  teamId: string;
  alertId?: string | null;
  jobId?: string | null;
  ruleId?: string | null;
  channelId?: string | null;
  channelType: string;
  recipient?: string | null;
  provider: string;
  sourceType: string;
  triggerType?: string | null;
  issueId?: string | null;
  monitorId?: string | null;
  incidentId?: string | null;
  statusPageId?: string | null;
  details?: Record<string, unknown> | null;
}

export async function recordDeliverySent(
  db: DB,
  context: DeliveryAuditContext,
  result?: { subject?: string | null; providerMessageId?: string | null }
): Promise<void> {
  await recordNotificationDeliveryAttempt(db, {
    ...context,
    status: "sent",
    subject: result?.subject ?? null,
    providerMessageId: result?.providerMessageId ?? null,
  });
}

export async function recordDeliveryFailed(
  db: DB,
  context: DeliveryAuditContext,
  error: unknown
): Promise<void> {
  await recordNotificationDeliveryAttempt(db, {
    ...context,
    status: "failed",
    errorMessage: serialiseError(error).message,
  });
}
