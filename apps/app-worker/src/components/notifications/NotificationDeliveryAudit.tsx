import { useState } from "react";

import { Card, CardTitle } from "@/components/layout";
import { ListContainer, ListRow } from "@/components/list";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui";
import { toTitleCase } from "@/utils/format";

export interface NotificationDeliveryAttempt {
  id: string;
  alertId: string | null;
  jobId: string | null;
  ruleId: string | null;
  ruleName: string | null;
  channelId: string | null;
  channelType: string;
  recipient: string | null;
  provider: string;
  status: string;
  subject: string | null;
  errorMessage: string | null;
  providerMessageId: string | null;
  sourceType: string;
  triggerType: string | null;
  issueId: string | null;
  monitorId: string | null;
  incidentId: string | null;
  statusPageId: string | null;
  detailsJson: string | null;
  createdAt: string;
}

interface NotificationDeliveryAuditProps {
  deliveries: NotificationDeliveryAttempt[];
  getTriggerLabel: (type: string) => string;
}

export function NotificationDeliveryAudit({
  deliveries,
  getTriggerLabel,
}: NotificationDeliveryAuditProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card>
      <CardTitle>Delivery Audit</CardTitle>
      <p className="muted mb-4">
        Shows notification delivery attempts after a rule or status page job
        reaches a channel.
      </p>
      <ListContainer
        isEmpty={!deliveries.length}
        emptyMessage="No delivery attempts have been recorded yet."
      >
        {deliveries.map((delivery, index) => {
          const expanded = expandedId === delivery.id;
          return (
            <ListRow
              key={delivery.id}
              isOdd={index > 0}
              expanded={expanded}
              title={
                <>
                  <Badge variant={statusPill(delivery.status)} size="small">
                    {toTitleCase(delivery.status)}
                  </Badge>
                  <span>
                    {delivery.ruleName || toTitleCase(delivery.sourceType)}
                  </span>
                </>
              }
              subtitle={
                <>
                  <div>
                    <span className="pill small">
                      {delivery.triggerType
                        ? getTriggerLabel(delivery.triggerType)
                        : toTitleCase(delivery.sourceType)}
                    </span>{" "}
                    · [{toTitleCase(delivery.channelType)}]{" "}
                    {delivery.recipient || "No recipient"} ·{" "}
                    {new Date(delivery.createdAt).toLocaleString()}
                  </div>
                  {delivery.errorMessage && (
                    <div className="text-[0.8rem]">{delivery.errorMessage}</div>
                  )}
                </>
              }
              actions={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setExpandedId(expanded ? null : delivery.id)}
                >
                  {expanded ? "Hide" : "Details"}
                </Button>
              }
              expandedContent={<DeliveryDetails delivery={delivery} />}
            />
          );
        })}
      </ListContainer>
    </Card>
  );
}

function DeliveryDetails({
  delivery,
}: {
  delivery: NotificationDeliveryAttempt;
}) {
  const details = parseDetails(delivery.detailsJson);
  const detailsText = details ? JSON.stringify(details, null, 2) : null;
  return (
    <div className="grid gap-2 text-sm">
      <DetailRow label="Subject" value={delivery.subject} />
      <DetailRow label="Provider" value={delivery.provider} />
      <DetailRow label="Provider message" value={delivery.providerMessageId} />
      <DetailRow label="Alert" value={delivery.alertId} />
      <DetailRow label="Job" value={delivery.jobId} />
      <DetailRow label="Rule" value={delivery.ruleId} />
      <DetailRow label="Channel" value={delivery.channelId} />
      <DetailRow label="Issue" value={delivery.issueId} />
      <DetailRow label="Monitor" value={delivery.monitorId} />
      <DetailRow label="Incident" value={delivery.incidentId} />
      <DetailRow label="Status page" value={delivery.statusPageId} />
      {detailsText && (
        <pre className="overflow-auto rounded border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-xs">
          {detailsText}
        </pre>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <span className="font-medium">{label}:</span> {value}
    </div>
  );
}

function statusPill(
  status: string
): "success" | "danger" | "muted" {
  if (status === "sent") return "success";
  if (status === "failed") return "danger";
  return "muted";
}

function parseDetails(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
