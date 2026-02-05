import assert from "node:assert/strict";
import test from "node:test";

import { parseOtlpLogs, parseOtlpTraces } from "./otlp.ts";

test("parseOtlpTraces maps root error spans into issue events", async () => {
  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "api" } },
            {
              key: "deployment.environment",
              value: { stringValue: "production" },
            },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: "abcd1234",
                spanId: "ef567890",
                name: "GET /health",
                kind: 2,
                startTimeUnixNano: "1700000000000000000",
                status: { code: 2, message: "boom" },
                attributes: [
                  { key: "http.method", value: { stringValue: "GET" } },
                  { key: "http.route", value: { stringValue: "/health" } },
                  {
                    key: "http.response.status_code",
                    value: { intValue: "500" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const result = await parseOtlpTraces(raw);

  assert.equal(result.length, 1);
  assert.equal(result[0].eventType, "event");
  assert.equal(result[0].level, "error");
  assert.equal(result[0].shouldCreateIssue, true);
  assert.equal(result[0].event.transaction, "/health");
  assert.equal(result[0].event.message, "boom");
  assert.equal(result[0].timestamp, 1700000000);
});

test("parseOtlpTraces maps non-error root spans as transactions", async () => {
  const payload = {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                traceId: "trace-ok",
                spanId: "span-ok",
                name: "GET /ok",
                kind: 2,
                startTimeUnixNano: "1700000005000000000",
                status: { code: 1 },
                attributes: [
                  { key: "http.method", value: { stringValue: "GET" } },
                  { key: "http.route", value: { stringValue: "/ok" } },
                  { key: "http.response.status_code", value: { intValue: "200" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const result = await parseOtlpTraces(raw);

  assert.equal(result.length, 1);
  assert.equal(result[0].eventType, "transaction");
  assert.equal(result[0].shouldCreateIssue, false);
});

test("parseOtlpLogs maps error logs into issue events", async () => {
  const payload = {
    resourceLogs: [
      {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: "api" } }],
        },
        scopeLogs: [
          {
            logRecords: [
              {
                timeUnixNano: "1700000001000000000",
                severityNumber: 17,
                severityText: "ERROR",
                body: { stringValue: "boom" },
              },
            ],
          },
        ],
      },
    ],
  };

  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const result = await parseOtlpLogs(raw);

  assert.equal(result.length, 1);
  assert.equal(result[0].eventType, "event");
  assert.equal(result[0].level, "error");
  assert.equal(result[0].shouldCreateIssue, true);
  assert.equal(result[0].event.message, "boom");
});

test("parseOtlpLogs keeps info logs as log events", async () => {
  const payload = {
    resourceLogs: [
      {
        scopeLogs: [
          {
            logRecords: [
              {
                timeUnixNano: "1700000002000000000",
                severityNumber: 9,
                severityText: "INFO",
                body: { stringValue: "ok" },
              },
            ],
          },
        ],
      },
    ],
  };

  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const result = await parseOtlpLogs(raw);

  assert.equal(result.length, 1);
  assert.equal(result[0].eventType, "log");
  assert.equal(result[0].shouldCreateIssue, false);
});
