interface StackFrame {
  filename?: string;
  function?: string;
  module?: string;
  in_app?: boolean;
  lineno?: number;
}

interface ExceptionValue {
  type?: string;
  value?: string;
  stacktrace?: {
    frames?: StackFrame[];
  };
}

interface EventData {
  fingerprint?: string[];
  culprit?: string;
  transaction?: string;
  message?: string;
  type?: string;
  exception?: { values?: ExceptionValue[] };
}

function normaliseDynamicSegments(value: string): string {
  return value
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "{uuid}")
    .replace(/0x[0-9a-f]+/gi, "{hex}")
    .replace(/\b\d+\b/g, "{num}")
    .replace(/https?:\/\/\S+/gi, "{url}")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseTransaction(value: string): string {
  return value
    .replace(/\b\d+\b/g, ":id")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":uuid")
    .trim();
}

function getPrimaryException(event: EventData): ExceptionValue | null {
  if (!event.exception?.values?.length) return null;
  return event.exception.values[0] || null;
}

function getPrimaryFrame(event: EventData): StackFrame | null {
  const exception = getPrimaryException(event);
  const frames = exception?.stacktrace?.frames;
  if (!frames?.length) return null;

  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    if (frame?.in_app) return frame;
  }

  return frames[frames.length - 1] || null;
}

function getCustomFingerprint(event: EventData): string[] | null {
  if (!Array.isArray(event.fingerprint) || event.fingerprint.length === 0) {
    return null;
  }

  const parts = event.fingerprint
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .filter((part) => part !== "{{ default }}");

  return parts.length ? parts : null;
}

export function computeFingerprint(event: EventData): string {
  const custom = getCustomFingerprint(event);
  if (custom) {
    return `custom::${custom.join("::")}`;
  }

  const parts: string[] = [];
  const exception = getPrimaryException(event);

  if (exception?.type) {
    parts.push(`exc:${exception.type}`);
  }

  const frame = getPrimaryFrame(event);
  if (frame) {
    const frameSignature =
      frame.module || frame.function || frame.filename || "unknown";
    parts.push(`frame:${frameSignature}`);
  }

  if (event.transaction) {
    parts.push(`txn:${normaliseTransaction(event.transaction)}`);
  }

  if (exception?.value) {
    parts.push(`msg:${normaliseDynamicSegments(exception.value)}`);
  } else if (event.message) {
    parts.push(`msg:${normaliseDynamicSegments(event.message)}`);
  }

  if (!parts.length) {
    if (event.type) return `type:${event.type}`;
    return "unknown";
  }

  return parts.join("::");
}

export function generateTitle(event: EventData): string {
  const exception = getPrimaryException(event);
  if (exception?.type) {
    const value = exception.value || "Unhandled exception";
    return `${exception.type}: ${value}`.slice(0, 180);
  }

  if (event.message) {
    return event.message.slice(0, 180);
  }

  if (event.transaction) {
    return event.transaction.slice(0, 180);
  }

  return "Untitled Issue";
}

export function extractCulprit(event: EventData): string | null {
  if (event.culprit?.trim()) return event.culprit.trim();

  const frame = getPrimaryFrame(event);
  if (!frame) return null;

  return frame.module || frame.function || frame.filename || null;
}
