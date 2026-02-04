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

