import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { createGitHubAppJwt, gitHubApiRequest } from "../github-app.ts";

function assertJwtFormat(token: string): void {
  assert.match(
    token,
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
  );
}

test("createGitHubAppJwt accepts PKCS#8 private key PEM", async () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  const token = await createGitHubAppJwt({
    appId: "12345",
    appPrivateKeyPem: pem,
  });

  assertJwtFormat(token);
});

test("createGitHubAppJwt accepts PKCS#1 RSA private key PEM", async () => {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

  const token = await createGitHubAppJwt({
    appId: "12345",
    appPrivateKeyPem: pem,
  });

  assertJwtFormat(token);
});

test("createGitHubAppJwt throws a clear error for malformed PEM", async () => {
  await assert.rejects(
    () =>
      createGitHubAppJwt({
        appId: "12345",
        appPrivateKeyPem: "-----BEGIN RSA PRIVATE KEY-----\nnot-base64\n-----END RSA PRIVATE KEY-----",
      }),
    /invalid base64|invalid/i
  );
});

test("gitHubApiRequest sends User-Agent header", async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeaders: HeadersInit | undefined;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    capturedHeaders = init?.headers;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await gitHubApiRequest({
      authToken: "token",
      path: "/app",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const headers = new Headers(capturedHeaders);
  assert.equal(headers.get("user-agent"), "bitwobbly-github-app/1.0");
});
