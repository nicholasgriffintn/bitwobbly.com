export type MonitorType =
  | "http"
  | "http_assert"
  | "http_keyword"
  | "tls"
  | "dns"
  | "tcp"
  | "webhook"
  | "heartbeat"
  | "external"
  | "manual";

interface MonitorTypeConfig {
  label: string;
  requiresUrl: boolean;
  urlLabel?: string;
  urlPlaceholder?: string;
  description?: string;
  hasExternalServiceField?: boolean;
}

export const MONITOR_TYPE_CONFIG: Record<MonitorType, MonitorTypeConfig> = {
  http: {
    label: "HTTP",
    requiresUrl: true,
    urlLabel: "URL",
    urlPlaceholder: "https://example.com/health",
  },
  http_assert: {
    label: "HTTP Assert",
    requiresUrl: true,
    urlLabel: "URL",
    urlPlaceholder: "https://example.com/health",
  },
  http_keyword: {
    label: "HTTP Keyword",
    requiresUrl: true,
    urlLabel: "URL",
    urlPlaceholder: "https://example.com/health",
  },
  tls: {
    label: "TLS Certificate",
    requiresUrl: true,
    urlLabel: "Target",
    urlPlaceholder: "example.com:443",
  },
  dns: {
    label: "DNS",
    requiresUrl: true,
    urlLabel: "Target",
    urlPlaceholder: "example.com",
  },
  tcp: {
    label: "TCP",
    requiresUrl: true,
    urlLabel: "Target",
    urlPlaceholder: "example.com:443",
  },
  webhook: {
    label: "Webhook",
    requiresUrl: false,
    description:
      "A webhook token will be generated. External services will push status updates to your webhook endpoint.",
  },
  heartbeat: {
    label: "Heartbeat",
    requiresUrl: false,
    description:
      "A token will be generated. Your cron will POST check-ins to your heartbeat endpoint. Missing check-ins will mark the monitor down.",
  },
  external: {
    label: "External",
    requiresUrl: true,
    urlLabel: "Status URL",
    urlPlaceholder: "https://status.example.com/api",
    hasExternalServiceField: true,
  },
  manual: {
    label: "Manual",
    requiresUrl: false,
    description: "Status is set manually via the dashboard or API.",
  },
};

export function validateJsonConfig(value: string) {
  if (!value.trim()) return null;
  try {
    JSON.parse(value);
    return null;
  } catch {
    return "Invalid JSON";
  }
}

export function configHelp(type: string) {
  if (type === "http_assert") {
    return {
      title: "HTTP assertions",
      description:
        "Assert expected status codes and optionally check the response body contains a string.",
      schema: `{
  "expectedStatus"?: number[],
  "bodyIncludes"?: string
}`,
      example: `{
  "expectedStatus": [200],
  "bodyIncludes": "ok"
}`,
    };
  }
  if (type === "http_keyword") {
    return {
      title: "Keyword match",
      description:
        "Fetch the URL and verify the response body contains a keyword.",
      schema: `{
  "keyword"?: string,
  "caseSensitive"?: boolean
}`,
      example: `{
  "keyword": "healthy",
  "caseSensitive": false
}`,
    };
  }
  if (type === "tls") {
    return {
      title: "TLS expiry",
      description:
        "Fail if the certificate expires too soon. Optional allowInvalid skips CA validation (not recommended).",
      schema: `{
  "minDaysRemaining"?: number,
  "allowInvalid"?: boolean
}`,
      example: `{
  "minDaysRemaining": 14,
  "allowInvalid": false
}`,
    };
  }
  if (type === "dns") {
    return {
      title: "DNS",
      description:
        "Resolve via DNS-over-HTTPS and optionally require an answer containing a substring.",
      schema: `{
  "recordType"?: "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "NS",
  "expectedIncludes"?: string
}`,
      example: `{
  "recordType": "A",
  "expectedIncludes": "1.2.3.4"
}`,
    };
  }
  if (type === "heartbeat") {
    return {
      title: "Cron heartbeat",
      description:
        "Check-ins are POSTed to the heartbeat URL. If no check-in arrives within interval + grace, the monitor goes down.",
      schema: `{
  "graceSeconds"?: number
}`,
      example: `{
  "graceSeconds": 30
}`,
    };
  }
  return null;
}
