import { randomId } from "@bitwobbly/shared";

const STATE_VERSION = 1;
const STATE_TTL_SECONDS = 15 * 60;
const STATE_MAX_CLOCK_SKEW_SECONDS = 5 * 60;

type GitHubInstallStatePayload = {
  v: number;
  teamId: string;
  userId: string | null;
  iat: number;
  nonce: string;
};

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 4096) {
    const chunk = bytes.slice(index, index + 4096);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}===`.slice(
    0,
    Math.ceil(value.length / 4) * 4
  );
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

async function hmacSha256Base64Url(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 4096) {
    const chunk = bytes.slice(index, index + 4096);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parsePayload(value: unknown): GitHubInstallStatePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid GitHub app install state payload");
  }
  const payload = value as Record<string, unknown>;
  const teamId = typeof payload.teamId === "string" ? payload.teamId.trim() : "";
  const userIdRaw = payload.userId;
  const userId =
    typeof userIdRaw === "string" && userIdRaw.trim().length > 0
      ? userIdRaw.trim()
      : null;
  const iat =
    typeof payload.iat === "number" && Number.isFinite(payload.iat)
      ? payload.iat
      : NaN;
  const nonce = typeof payload.nonce === "string" ? payload.nonce.trim() : "";
  const version = payload.v;

  if (!teamId || !Number.isFinite(iat) || !nonce) {
    throw new Error("Invalid GitHub app install state payload");
  }
  if (version !== STATE_VERSION) {
    throw new Error("Unsupported GitHub app install state version");
  }

  return {
    v: STATE_VERSION,
    teamId,
    userId,
    iat,
    nonce,
  };
}

export async function createGitHubInstallStateToken(input: {
  sessionSecret: string;
  teamId: string;
  userId: string | null;
}): Promise<string> {
  const secret = input.sessionSecret.trim();
  if (!secret) throw new Error("Missing SESSION_SECRET");
  const teamId = input.teamId.trim();
  if (!teamId) throw new Error("Missing team id");

  const payload: GitHubInstallStatePayload = {
    v: STATE_VERSION,
    teamId,
    userId: input.userId?.trim() || null,
    iat: Math.floor(Date.now() / 1000),
    nonce: randomId("gh_state"),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await hmacSha256Base64Url(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifyGitHubInstallStateToken(input: {
  sessionSecret: string;
  token: string;
  expectedTeamId: string;
  expectedUserId: string | null;
}): Promise<void> {
  const secret = input.sessionSecret.trim();
  if (!secret) throw new Error("Missing SESSION_SECRET");
  const token = input.token.trim();
  if (!token) throw new Error("Missing GitHub install state token");

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid GitHub install state token");
  }

  const expectedSignature = await hmacSha256Base64Url(secret, encodedPayload);
  if (signature !== expectedSignature) {
    throw new Error("GitHub install state signature mismatch");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    throw new Error("GitHub install state payload could not be decoded");
  }

  const payload = parsePayload(decoded);
  if (payload.teamId !== input.expectedTeamId) {
    throw new Error("GitHub install state team mismatch");
  }
  if (payload.userId && payload.userId !== input.expectedUserId) {
    throw new Error("GitHub install state user mismatch");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iat > now + STATE_MAX_CLOCK_SKEW_SECONDS) {
    throw new Error("GitHub install state issued in the future");
  }
  if (now - payload.iat > STATE_TTL_SECONDS) {
    throw new Error("GitHub install state expired");
  }
}
