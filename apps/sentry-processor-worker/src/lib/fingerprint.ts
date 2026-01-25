interface EventData {
  exception?: { values?: Array<{ type?: string; value?: string }> };
  message?: string;
  transaction?: string;
  type?: string;
}

export function computeFingerprint(event: EventData): string {
  const parts: string[] = [];

  if (event.exception?.values?.[0]) {
    const exc = event.exception.values[0];
    parts.push(exc.type || "Error");
    parts.push(exc.value || "");
  } else if (event.message) {
    parts.push(event.message);
  } else if (event.transaction) {
    parts.push(event.transaction);
  } else if (event.type) {
    parts.push(event.type);
  } else {
    parts.push("unknown");
  }

  return parts.join("::");
}

export function generateTitle(event: EventData): string {
  if (event.exception?.values?.[0]) {
    const exc = event.exception.values[0];
    return `${exc.type || "Error"}: ${exc.value || "Unknown error"}`;
  }

  if (event.message) {
    return event.message.slice(0, 100);
  }

  if (event.transaction) {
    return event.transaction;
  }

  return "Untitled Issue";
}

export function extractCulprit(event: EventData): string | null {
  if (event.exception?.values?.[0]) {
    return null;
  }
  return null;
}
