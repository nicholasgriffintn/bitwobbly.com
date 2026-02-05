import { getArray, getNumber, getString, isRecord, safeJsonParse } from "./guards";
import type { SentryEvent } from "./sentry-payloads";

export type OtlpMappedEvent = {
  event: SentryEvent;
  eventType: "event" | "transaction" | "log";
  level: string | null;
  timestamp: number | null;
  shouldCreateIssue: boolean;
  eventId?: string;
};

const MAX_TAGS = 50;
const MAX_TAG_VALUE = 200;

export async function parseOtlpTraces(
  raw: Uint8Array
): Promise<OtlpMappedEvent[]> {
  const payload = await decodeOtlpJson(raw);
  if (!payload) return [];

  const resourceSpans = getRecordArray(payload, "resourceSpans");
  const out: OtlpMappedEvent[] = [];

  for (const resourceSpan of resourceSpans) {
    const resourceAttrs = readAttributes(resourceSpan.resource);
    const scopeSpans =
      getRecordArray(resourceSpan, "scopeSpans").length > 0
        ? getRecordArray(resourceSpan, "scopeSpans")
        : getRecordArray(resourceSpan, "instrumentationLibrarySpans");

    for (const scopeSpan of scopeSpans) {
      const spans = getRecordArray(scopeSpan, "spans");
      for (const span of spans) {
        const parentSpanId =
          getString(span, "parentSpanId") || getString(span, "parent_span_id");
        const isRoot =
          !parentSpanId ||
          /^0+$/.test(parentSpanId) ||
          parentSpanId.length === 0;
        if (!isRoot) continue;

        const spanAttrs = readAttributes(span);
        const attrs = { ...resourceAttrs, ...spanAttrs };
        const status = isRecord(span.status) ? span.status : null;
        const statusCode = parseStatusCode(status?.code);
        const httpStatus = parseHttpStatus(attrs);
        const isError =
          statusCode === "error" ||
          (typeof httpStatus === "number" && httpStatus >= 500);

        const name = getString(span, "name") || "OTLP Span";
        const transaction =
          attrs["http.route"] ||
          attrs["rpc.method"] ||
          attrs["url.path"] ||
          name;
        const message =
          (status && getString(status, "message")) ||
          (isError ? name : null) ||
          name;

        const event: SentryEvent = {
          message,
          transaction,
          culprit: attrs["code.function"] || attrs["code.namespace"],
          release: attrs["service.version"] || attrs["deployment.version"],
          environment:
            attrs["deployment.environment"] ||
            attrs["service.environment"] ||
            attrs["environment"],
          user: buildUser(attrs),
          tags: pickTags(attrs, {
            "trace.id": getString(span, "traceId"),
            "span.id": getString(span, "spanId"),
            "span.kind": parseSpanKind(getNumber(span, "kind")),
          }),
          request: buildRequest(attrs),
          contexts: buildAppContext(attrs),
        };

        out.push({
          event,
          eventType: isError ? "event" : "transaction",
          level: isError ? "error" : "info",
          timestamp: toUnixSeconds(getString(span, "startTimeUnixNano")),
          shouldCreateIssue: isError,
          eventId: buildTraceEventId(span),
        });
      }
    }
  }

  return out;
}

export async function parseOtlpLogs(
  raw: Uint8Array
): Promise<OtlpMappedEvent[]> {
  const payload = await decodeOtlpJson(raw);
  if (!payload) return [];

  const resourceLogs = getRecordArray(payload, "resourceLogs");
  const out: OtlpMappedEvent[] = [];

  for (const resourceLog of resourceLogs) {
    const resourceAttrs = readAttributes(resourceLog.resource);
    const scopeLogs =
      getRecordArray(resourceLog, "scopeLogs").length > 0
        ? getRecordArray(resourceLog, "scopeLogs")
        : getRecordArray(resourceLog, "instrumentationLibraryLogs");

    for (const scopeLog of scopeLogs) {
      const records = getRecordArray(scopeLog, "logRecords");
      for (const record of records) {
        const attrs = { ...resourceAttrs, ...readAttributes(record) };
        const severityNumber = getNumber(record, "severityNumber");
        const severityText = getString(record, "severityText");
        const level = mapSeverityLevel(severityNumber, severityText);
        const shouldCreateIssue = level === "error" || level === "fatal";

        const body = readAnyValue(record.body);
        const message =
          body ||
          severityText ||
          attrs["exception.message"] ||
          "Log entry";

        const event: SentryEvent = {
          message,
          culprit: attrs["code.function"] || attrs["code.namespace"],
          release: attrs["service.version"] || attrs["deployment.version"],
          environment:
            attrs["deployment.environment"] ||
            attrs["service.environment"] ||
            attrs["environment"],
          user: buildUser(attrs),
          tags: pickTags(attrs, {
            "trace.id": getString(record, "traceId"),
            "span.id": getString(record, "spanId"),
            "severity.text": severityText,
          }),
          request: buildRequest(attrs),
          contexts: buildAppContext(attrs),
        };

        out.push({
          event,
          eventType: shouldCreateIssue ? "event" : "log",
          level,
          timestamp: toUnixSeconds(getString(record, "timeUnixNano")),
          shouldCreateIssue,
        });
      }
    }
  }

  return out;
}

async function decodeOtlpJson(
  raw: Uint8Array
): Promise<Record<string, {}> | null> {
  const payload = await maybeDecompress(raw);
  const text = new TextDecoder().decode(payload);
  const parsed = safeJsonParse(text);
  return isRecord(parsed) ? parsed : null;
}

async function maybeDecompress(raw: Uint8Array): Promise<Uint8Array> {
  if (raw.length < 2) return raw;
  const isGzip = raw[0] === 0x1f && raw[1] === 0x8b;
  if (!isGzip || typeof DecompressionStream === "undefined") return raw;

  const stream = new DecompressionStream("gzip");
  const body = new Response(raw).body;
  if (!body) return raw;

  const decompressed = body.pipeThrough(stream);
  const buf = await new Response(decompressed).arrayBuffer();
  return new Uint8Array(buf);
}

function getRecordArray(obj: Record<string, {}>, key: string) {
  const arr = getArray(obj, key);
  if (!arr) return [];
  const out: Record<string, {}>[] = [];
  for (const item of arr) {
    if (isRecord(item)) out.push(item);
  }
  return out;
}

function readAttributes(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const attrs = getArray(value, "attributes");
  if (!attrs?.length) return {};

  const out: Record<string, string> = {};
  for (const entry of attrs) {
    if (!isRecord(entry)) continue;
    const key = getString(entry, "key");
    if (!key || key in out) continue;
    const valueString = readAnyValue(entry.value);
    if (valueString != null) {
      out[key] = valueString;
    }
  }
  return out;
}

function readAnyValue(value: unknown): string | null {
  if (!isRecord(value)) return null;

  if (typeof value.stringValue === "string") return value.stringValue;
  if (typeof value.boolValue === "boolean") return value.boolValue ? "true" : "false";
  if (typeof value.intValue === "number" || typeof value.intValue === "string") {
    return String(value.intValue);
  }
  if (typeof value.doubleValue === "number" || typeof value.doubleValue === "string") {
    return String(value.doubleValue);
  }
  if (typeof value.bytesValue === "string") return value.bytesValue;

  if (isRecord(value.arrayValue)) {
    const values = Array.isArray(value.arrayValue.values)
      ? value.arrayValue.values
      : [];
    const parts = values
      .map((entry) => readAnyValue(entry))
      .filter((entry): entry is string => typeof entry === "string");
    return parts.length ? parts.join(",") : null;
  }

  if (isRecord(value.kvlistValue)) {
    const values = Array.isArray(value.kvlistValue.values)
      ? value.kvlistValue.values
      : [];
    const obj: Record<string, string> = {};
    for (const entry of values) {
      if (!isRecord(entry)) continue;
      const key = getString(entry, "key");
      if (!key) continue;
      const valueString = readAnyValue(entry.value);
      if (valueString != null) obj[key] = valueString;
    }
    return Object.keys(obj).length ? JSON.stringify(obj) : null;
  }

  return null;
}

function buildUser(attrs: Record<string, string>) {
  const id =
    attrs["enduser.id"] ||
    attrs["user.id"] ||
    attrs["user.identifier"] ||
    attrs["client.id"];
  const email = attrs["enduser.email"] || attrs["user.email"];
  const username = attrs["enduser.username"] || attrs["user.name"];
  const ip_address =
    attrs["client.address"] || attrs["net.peer.ip"] || attrs["source.address"];

  if (!id && !email && !username && !ip_address) return undefined;
  return {
    id,
    email,
    username,
    ip_address,
  };
}

function buildRequest(attrs: Record<string, string>) {
  const method =
    attrs["http.method"] ||
    attrs["http.request.method"] ||
    attrs["rpc.method"];
  const url =
    attrs["url.full"] ||
    attrs["http.url"] ||
    buildUrl(
      attrs["url.scheme"] || attrs["http.scheme"],
      attrs["http.host"] ||
        attrs["server.address"] ||
        attrs["net.peer.name"] ||
        attrs["net.host.name"],
      attrs["url.path"] || attrs["http.target"] || attrs["http.route"]
    );

  if (!method && !url) return undefined;
  return {
    url: url || undefined,
    method: method || undefined,
  };
}

function buildUrl(
  scheme?: string,
  host?: string,
  path?: string
): string | null {
  if (!host && !path) return null;
  const safeScheme = scheme || "https";
  const safeHost = host || "unknown";
  const safePath = path || "";
  if (safePath.startsWith("http://") || safePath.startsWith("https://")) {
    return safePath;
  }
  const normalisedPath = safePath.startsWith("/") ? safePath : `/${safePath}`;
  return `${safeScheme}://${safeHost}${normalisedPath}`;
}

function buildAppContext(attrs: Record<string, string>) {
  const serviceName = attrs["service.name"];
  const serviceVersion = attrs["service.version"];
  const sdkName = attrs["telemetry.sdk.name"];
  const sdkVersion = attrs["telemetry.sdk.version"];
  const context: Record<string, {}> = {};

  if (serviceName) context["service.name"] = serviceName;
  if (serviceVersion) context["service.version"] = serviceVersion;
  if (sdkName) context["telemetry.sdk.name"] = sdkName;
  if (sdkVersion) context["telemetry.sdk.version"] = sdkVersion;

  return Object.keys(context).length ? { app: context } : undefined;
}

function pickTags(
  attrs: Record<string, string>,
  extra: Record<string, string | undefined>
) {
  const tags: Record<string, string> = {};
  let count = 0;

  const add = (key: string, value: string | undefined) => {
    if (!value || count >= MAX_TAGS || key in tags) return;
    const trimmed = value.length > MAX_TAG_VALUE ? value.slice(0, MAX_TAG_VALUE) : value;
    tags[key] = trimmed;
    count += 1;
  };

  for (const [key, value] of Object.entries(attrs)) {
    add(key, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) add(key, value);
  }

  return Object.keys(tags).length ? tags : undefined;
}

function parseStatusCode(value: unknown): "ok" | "error" | null {
  if (typeof value === "number") {
    if (value === 1) return "ok";
    if (value === 2) return "error";
  }
  if (typeof value === "string") {
    const num = Number(value);
    if (Number.isFinite(num)) return parseStatusCode(num);
    const lower = value.toLowerCase();
    if (lower === "ok") return "ok";
    if (lower === "error") return "error";
  }
  return null;
}

function parseHttpStatus(attrs: Record<string, string>): number | null {
  const raw =
    attrs["http.response.status_code"] ||
    attrs["http.status_code"] ||
    attrs["http.response.status"] ||
    attrs["http.status"];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSpanKind(kind?: number): string | undefined {
  switch (kind) {
    case 1:
      return "internal";
    case 2:
      return "server";
    case 3:
      return "client";
    case 4:
      return "producer";
    case 5:
      return "consumer";
    default:
      return undefined;
  }
}

function mapSeverityLevel(
  severityNumber?: number,
  severityText?: string
): string {
  if (typeof severityNumber === "number") {
    if (severityNumber >= 21) return "fatal";
    if (severityNumber >= 17) return "error";
    if (severityNumber >= 13) return "warning";
    if (severityNumber >= 9) return "info";
    if (severityNumber >= 5) return "debug";
    return "debug";
  }

  const text = severityText?.toLowerCase();
  if (!text) return "info";
  if (text.includes("fatal")) return "fatal";
  if (text.includes("error")) return "error";
  if (text.includes("warn")) return "warning";
  if (text.includes("debug") || text.includes("trace")) return "debug";
  return "info";
}

function toUnixSeconds(value?: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 1e9);
}

function buildTraceEventId(span: Record<string, {}>): string | undefined {
  const traceId = getString(span, "traceId");
  const spanId = getString(span, "spanId");
  if (!traceId || !spanId) return undefined;
  return `${traceId}-${spanId}`;
}
