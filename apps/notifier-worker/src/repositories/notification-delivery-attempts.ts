import { nowIso, randomId, schema } from "@bitwobbly/shared";

import type { DB } from "@bitwobbly/shared";

export interface RecordNotificationDeliveryAttemptInput {
  teamId: string;
  alertId?: string | null;
  jobId?: string | null;
  ruleId?: string | null;
  channelId?: string | null;
  channelType: string;
  recipient?: string | null;
  provider: string;
  status: "sent" | "failed" | "skipped";
  subject?: string | null;
  errorMessage?: string | null;
  providerMessageId?: string | null;
  sourceType: string;
  triggerType?: string | null;
  issueId?: string | null;
  monitorId?: string | null;
  incidentId?: string | null;
  statusPageId?: string | null;
  details?: Record<string, unknown> | null;
}

export async function recordNotificationDeliveryAttempt(
  db: DB,
  input: RecordNotificationDeliveryAttemptInput
): Promise<void> {
  await db.insert(schema.notificationDeliveryAttempts).values({
    id: randomId("nda"),
    teamId: input.teamId,
    alertId: input.alertId ?? null,
    jobId: input.jobId ?? null,
    ruleId: input.ruleId ?? null,
    channelId: input.channelId ?? null,
    channelType: input.channelType,
    recipient: input.recipient ?? null,
    provider: input.provider,
    status: input.status,
    subject: input.subject ?? null,
    errorMessage: input.errorMessage ?? null,
    providerMessageId: input.providerMessageId ?? null,
    sourceType: input.sourceType,
    triggerType: input.triggerType ?? null,
    issueId: input.issueId ?? null,
    monitorId: input.monitorId ?? null,
    incidentId: input.incidentId ?? null,
    statusPageId: input.statusPageId ?? null,
    detailsJson: input.details ? JSON.stringify(input.details) : null,
    createdAt: nowIso(),
  });
}
