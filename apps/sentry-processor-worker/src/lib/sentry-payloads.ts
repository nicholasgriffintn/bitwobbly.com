import { getArray, getNumber, getString, isRecord, parseStringArray, parseStringRecord } from "./guards";

export interface SentryEvent {
  platform?: string;
  transaction?: string;
  culprit?: string;
  fingerprint?: string[];
  level?: string;
  message?: string;
  release?: string;
  environment?: string;
  user?: {
    id?: string;
    username?: string;
    email?: string;
    ip_address?: string;
  };
  tags?: Record<string, string>;
  contexts?: {
    device?: Record<string, unknown>;
    os?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
    browser?: Record<string, unknown>;
    app?: Record<string, unknown>;
  };
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    data?: Record<string, unknown>;
  };
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      mechanism?: Record<string, unknown>;
      stacktrace?: {
        frames?: Array<Record<string, unknown>>;
      };
    }>;
  };
  breadcrumbs?: Array<{
    timestamp?: string;
    type?: string;
    category?: string;
    message?: string;
    level?: string;
    data?: Record<string, unknown>;
  }>;
}

export function parseSentryEvent(value: unknown): SentryEvent | null {
  if (!isRecord(value)) return null;

  const out: SentryEvent = {};

  out.platform = getString(value, "platform");
  out.transaction = getString(value, "transaction");
  out.culprit = getString(value, "culprit");
  out.level = getString(value, "level");
  out.message = getString(value, "message");
  out.release = getString(value, "release");
  out.environment = getString(value, "environment");

  const fingerprint = parseStringArray(value.fingerprint);
  if (fingerprint) out.fingerprint = fingerprint;

  if (isRecord(value.user)) {
    const user: NonNullable<SentryEvent["user"]> = {};
    const id = getString(value.user, "id");
    const username = getString(value.user, "username");
    const email = getString(value.user, "email");
    const ip_address = getString(value.user, "ip_address");

    if (id) user.id = id;
    if (username) user.username = username;
    if (email) user.email = email;
    if (ip_address) user.ip_address = ip_address;

    if (Object.keys(user).length) out.user = user;
  }

  const tags = parseStringRecord(value.tags);
  if (tags) out.tags = tags;

  if (isRecord(value.contexts)) {
    const contexts: NonNullable<SentryEvent["contexts"]> = {};

    if (isRecord(value.contexts.device)) contexts.device = value.contexts.device;
    if (isRecord(value.contexts.os)) contexts.os = value.contexts.os;
    if (isRecord(value.contexts.runtime)) contexts.runtime = value.contexts.runtime;
    if (isRecord(value.contexts.browser)) contexts.browser = value.contexts.browser;
    if (isRecord(value.contexts.app)) contexts.app = value.contexts.app;

    if (Object.keys(contexts).length) out.contexts = contexts;
  }

  if (isRecord(value.request)) {
    const request: NonNullable<SentryEvent["request"]> = {};
    const url = getString(value.request, "url");
    const method = getString(value.request, "method");
    const headers = parseStringRecord(value.request.headers);

    if (url) request.url = url;
    if (method) request.method = method;
    if (headers) request.headers = headers;
    if (isRecord(value.request.data)) request.data = value.request.data;

    if (Object.keys(request).length) out.request = request;
  }

  if (isRecord(value.exception)) {
    const values = getArray(value.exception, "values");
    if (values?.length) {
      const parsedValues: NonNullable<NonNullable<SentryEvent["exception"]>["values"]> = [];
      for (const v of values) {
        if (!isRecord(v)) continue;
        const item: NonNullable<NonNullable<SentryEvent["exception"]>["values"]>[number] = {};

        const type = getString(v, "type");
        const val = getString(v, "value");
        if (type) item.type = type;
        if (val) item.value = val;

        if (isRecord(v.mechanism)) item.mechanism = v.mechanism;

        if (isRecord(v.stacktrace)) {
          const stacktrace: NonNullable<NonNullable<SentryEvent["exception"]>["values"]>[number]["stacktrace"] = {};
          if (Array.isArray(v.stacktrace.frames)) {
            const frames: Array<Record<string, unknown>> = [];
            for (const frame of v.stacktrace.frames) {
              if (isRecord(frame)) frames.push(frame);
            }
            if (frames.length) stacktrace.frames = frames;
          }
          item.stacktrace = stacktrace;
        }

        if (Object.keys(item).length) parsedValues.push(item);
      }

      if (parsedValues.length) out.exception = { values: parsedValues };
    }
  }

  if (Array.isArray(value.breadcrumbs)) {
    const crumbs: NonNullable<SentryEvent["breadcrumbs"]> = [];
    for (const entry of value.breadcrumbs) {
      if (!isRecord(entry)) continue;
      const crumb: NonNullable<SentryEvent["breadcrumbs"]>[number] = {};

      const timestamp = getString(entry, "timestamp");
      const type = getString(entry, "type");
      const category = getString(entry, "category");
      const message = getString(entry, "message");
      const level = getString(entry, "level");

      if (timestamp) crumb.timestamp = timestamp;
      if (type) crumb.type = type;
      if (category) crumb.category = category;
      if (message) crumb.message = message;
      if (level) crumb.level = level;
      if (isRecord(entry.data)) crumb.data = entry.data;

      if (Object.keys(crumb).length) crumbs.push(crumb);
    }
    if (crumbs.length) out.breadcrumbs = crumbs;
  }

  return out;
}

export type SessionPayload = {
  sid?: string;
  did?: string;
  status?: string;
  errors?: number;
  started?: string | number;
  duration?: number;
  release?: string;
  environment?: string;
  user_agent?: string;
  userAgent?: string;
  attrs?: { release?: string; environment?: string };
  aggregates?: Array<Record<string, unknown>>;
};

export function parseSessionPayload(value: unknown): SessionPayload | null {
  if (!isRecord(value)) return null;

  const out: SessionPayload = {};
  const sid = getString(value, "sid");
  const did = getString(value, "did");
  const status = getString(value, "status");

  if (sid) out.sid = sid;
  if (did) out.did = did;
  if (status) out.status = status;

  const errors = getNumber(value, "errors");
  if (errors !== undefined) out.errors = errors;

  const started = value.started;
  if (typeof started === "string" || typeof started === "number") {
    out.started = started;
  }

  const duration = getNumber(value, "duration");
  if (duration !== undefined) out.duration = duration;

  const release = getString(value, "release");
  const environment = getString(value, "environment");
  if (release) out.release = release;
  if (environment) out.environment = environment;

  const user_agent = getString(value, "user_agent");
  const userAgent = getString(value, "userAgent");
  if (user_agent) out.user_agent = user_agent;
  if (userAgent) out.userAgent = userAgent;

  if (isRecord(value.attrs)) {
    const attrs: NonNullable<SessionPayload["attrs"]> = {};
    const attrsRelease = getString(value.attrs, "release");
    const attrsEnv = getString(value.attrs, "environment");
    if (attrsRelease) attrs.release = attrsRelease;
    if (attrsEnv) attrs.environment = attrsEnv;
    if (Object.keys(attrs).length) out.attrs = attrs;
  }

  const aggregates = getArray(value, "aggregates");
  if (aggregates?.length) {
    const parsedAgg: Array<Record<string, unknown>> = [];
    for (const agg of aggregates) {
      if (isRecord(agg)) parsedAgg.push(agg);
    }
    if (parsedAgg.length) out.aggregates = parsedAgg;
  }

  return out;
}

export type ClientReportPayload = {
  timestamp?: string | number;
  discarded_events?: Array<{
    reason?: string;
    category?: string;
    quantity?: number;
  }>;
};

export function parseClientReportPayload(
  value: unknown,
): ClientReportPayload | null {
  if (!isRecord(value)) return null;

  const out: ClientReportPayload = {};
  const timestamp = value.timestamp;
  if (typeof timestamp === "string" || typeof timestamp === "number") {
    out.timestamp = timestamp;
  }

  if (Array.isArray(value.discarded_events)) {
    const items: NonNullable<ClientReportPayload["discarded_events"]> = [];
    for (const entry of value.discarded_events) {
      if (!isRecord(entry)) continue;
      const reason = getString(entry, "reason");
      const category = getString(entry, "category");
      const quantity = getNumber(entry, "quantity");
      items.push({
        reason,
        category,
        quantity,
      });
    }
    out.discarded_events = items;
  }

  return out;
}

