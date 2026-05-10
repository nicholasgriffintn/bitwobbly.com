import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EMAIL_FROM,
  sendAlertEmail,
  sendIssueAlertEmail,
} from "./email.ts";

type FetchCall = {
  url: string;
  init: RequestInit;
};

function captureFetch(status = 202, body = "", headers?: HeadersInit) {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body, { headers, status });
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("sendIssueAlertEmail uses configured sender and escapes HTML fields", async () => {
  const fetchMock = captureFetch();
  try {
    const result = await sendIssueAlertEmail({
      email: "bitwobbly@nicholasgriffin.co.uk",
      alertId: "al_<1>",
      ruleName: "Rule <script>",
      severity: "critical",
      triggerType: "new_issue",
      issue: {
        id: "iss_1",
        title: "<script>alert(1)</script>",
        level: "error",
        culprit: "src/<bad>.ts",
        eventCount: 2,
        userCount: 1,
        firstSeenAt: 1_700_000_000,
        lastSeenAt: 1_700_000_001,
      },
      projectName: "Project <x>",
      environment: "prod <blue>",
      from: "bitwobbly@notifications.nicholasgriffin.co.uk",
      subjectPrefix: "BitWobbly Alert",
      resendApiKey: "resend-key",
    });

    assert.equal(fetchMock.calls.length, 1);
    const payload = JSON.parse(String(fetchMock.calls[0].init.body));
    assert.equal(
      payload.from,
      "BitWobbly <bitwobbly@notifications.nicholasgriffin.co.uk>"
    );
    assert.match(payload.subject, /^BitWobbly Alert - /);
    assert.match(payload.html, /Rule &lt;script&gt;/);
    assert.match(payload.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(payload.html, /Project &lt;x&gt; \(prod &lt;blue&gt;\)/);
    assert.doesNotMatch(payload.html, /<script>alert/);
    assert.equal(result.providerMessageId, null);
  } finally {
    fetchMock.restore();
  }
});

test("sendAlertEmail returns the Resend message id", async () => {
  const fetchMock = captureFetch(202, JSON.stringify({ id: "email_123" }), {
    "content-type": "application/json",
  });
  try {
    const result = await sendAlertEmail({
      email: "bitwobbly@nicholasgriffin.co.uk",
      statusText: "Service Down",
      alertId: "al_1",
      monitorId: "mon_1",
      status: "down",
      resendApiKey: "resend-key",
    });

    assert.equal(fetchMock.calls.length, 1);
    const payload = JSON.parse(String(fetchMock.calls[0].init.body));
    assert.equal(payload.from, DEFAULT_EMAIL_FROM);
    assert.equal(payload.subject, "BitWobbly Alert - Service Down");
    assert.equal(result.providerMessageId, "email_123");
  } finally {
    fetchMock.restore();
  }
});

test("sendAlertEmail throws Resend failures so the queue can retry", async () => {
  const fetchMock = captureFetch(403, "sender domain is not verified");
  try {
    await assert.rejects(
      sendAlertEmail({
        email: "bitwobbly@nicholasgriffin.co.uk",
        statusText: "Service Down",
        alertId: "al_1",
        monitorId: "mon_1",
        status: "down",
        resendApiKey: "resend-key",
      }),
      /sender domain is not verified/
    );
  } finally {
    fetchMock.restore();
  }
});
