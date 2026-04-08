import { isRecord } from "../lib/type-guards.ts";
import { toFiniteNumber, toNonEmptyString } from "../lib/value-utils.ts";

const GITHUB_ACCEPT = "application/vnd.github+json";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_API_BASE_URL = "https://api.github.com";

export type GitHubAppCredentials = {
  appId: string;
  appPrivateKeyPem: string;
};

export type GitHubInstallationSummary = {
  installationId: number;
  accountLogin: string;
  accountType: string;
  targetType: string;
  targetId: number | null;
  repositorySelection: "all" | "selected" | "unknown";
  suspendedAt: string | null;
};

export type GitHubInstallationRepository = {
  id: number;
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string;
  isPrivate: boolean;
};

export type GitHubApiRequestInput = {
  authToken: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
};

function toBase64UrlFromText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 4096) {
    const chunk = bytes.slice(index, index + 4096);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toBase64UrlFromBytes(value: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < value.length; index += 4096) {
    const chunk = value.slice(index, index + 4096);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parsePkcs8Pem(input: string): ArrayBuffer {
  const normalised = input.replace(/\\n/g, "\n");
  const stripped = normalised
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const decoded = atob(stripped);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes.buffer;
}

function parseRepositorySelection(value: unknown): "all" | "selected" | "unknown" {
  if (value === "all") return "all";
  if (value === "selected") return "selected";
  return "unknown";
}

function parseInstallationSummary(
  payload: Record<string, unknown>
): GitHubInstallationSummary | null {
  const installationId = toFiniteNumber(payload.id);
  const targetType = toNonEmptyString(payload.target_type);
  if (!installationId || !targetType) return null;

  const account = isRecord(payload.account) ? payload.account : null;
  const accountLogin = account ? toNonEmptyString(account.login) : null;
  const accountType = account ? toNonEmptyString(account.type) : null;
  if (!accountLogin || !accountType) return null;

  return {
    installationId,
    accountLogin,
    accountType,
    targetType,
    targetId: toFiniteNumber(payload.target_id),
    repositorySelection: parseRepositorySelection(payload.repository_selection),
    suspendedAt: toNonEmptyString(payload.suspended_at),
  };
}

function parseInstallationRepository(
  payload: Record<string, unknown>
): GitHubInstallationRepository | null {
  const id = toFiniteNumber(payload.id);
  const name = toNonEmptyString(payload.name);
  const fullName = toNonEmptyString(payload.full_name);
  const defaultBranch = toNonEmptyString(payload.default_branch);
  const owner = isRecord(payload.owner) ? payload.owner : null;
  const ownerLogin = owner ? toNonEmptyString(owner.login) : null;
  const isPrivate = typeof payload.private === "boolean" ? payload.private : null;

  if (!id || !name || !fullName || !ownerLogin || !defaultBranch || isPrivate === null) {
    return null;
  }

  return {
    id,
    name,
    fullName,
    ownerLogin,
    defaultBranch,
    isPrivate,
  };
}

export async function createGitHubAppJwt(
  credentials: GitHubAppCredentials
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const claims = {
    iat: nowSec - 60,
    exp: nowSec + 540,
    iss: credentials.appId,
  };

  const encodedHeader = toBase64UrlFromText(JSON.stringify(header));
  const encodedClaims = toBase64UrlFromText(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    parsePkcs8Pem(credentials.appPrivateKeyPem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const signature = toBase64UrlFromBytes(new Uint8Array(signatureBuffer));

  return `${signingInput}.${signature}`;
}

export async function gitHubApiRequest(input: GitHubApiRequestInput): Promise<unknown> {
  const url = `${GITHUB_API_BASE_URL}${input.path}`;
  const response = await fetch(url, {
    method: input.method ?? "GET",
    headers: {
      accept: GITHUB_ACCEPT,
      authorization: `Bearer ${input.authToken}`,
      "x-github-api-version": GITHUB_API_VERSION,
      "content-type": "application/json",
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`GitHub API ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function createGitHubInstallationToken(input: {
  credentials: GitHubAppCredentials;
  installationId: number;
  permissions?: Record<string, "read" | "write">;
}): Promise<string> {
  const appToken = await createGitHubAppJwt(input.credentials);

  const tokenResponse = await gitHubApiRequest({
    authToken: appToken,
    method: "POST",
    path: `/app/installations/${input.installationId}/access_tokens`,
    body: {
      permissions: input.permissions ?? {
        contents: "write",
        pull_requests: "write",
      },
    },
  });

  if (!isRecord(tokenResponse)) {
    throw new Error("GitHub token response was invalid");
  }

  const token = toNonEmptyString(tokenResponse.token);
  if (!token) {
    throw new Error("GitHub installation token response did not include a token");
  }
  return token;
}

export async function getGitHubInstallation(input: {
  credentials: GitHubAppCredentials;
  installationId: number;
}): Promise<GitHubInstallationSummary> {
  const appToken = await createGitHubAppJwt(input.credentials);
  const payload = await gitHubApiRequest({
    authToken: appToken,
    path: `/app/installations/${input.installationId}`,
  });
  if (!isRecord(payload)) {
    throw new Error("GitHub installation payload was invalid");
  }
  const summary = parseInstallationSummary(payload);
  if (!summary) {
    throw new Error("GitHub installation details were incomplete");
  }
  return summary;
}

export async function listGitHubInstallationRepositories(input: {
  credentials: GitHubAppCredentials;
  installationId: number;
}): Promise<GitHubInstallationRepository[]> {
  const installationToken = await createGitHubInstallationToken({
    credentials: input.credentials,
    installationId: input.installationId,
    permissions: {
      contents: "read",
      pull_requests: "read",
    },
  });

  const repositories: GitHubInstallationRepository[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await gitHubApiRequest({
      authToken: installationToken,
      path: `/installation/repositories?per_page=100&page=${page}`,
    });
    if (!isRecord(payload)) {
      throw new Error("GitHub repositories response was invalid");
    }

    const batch = Array.isArray(payload.repositories) ? payload.repositories : [];
    const parsedBatch = batch
      .map((entry) =>
        isRecord(entry) ? parseInstallationRepository(entry) : null
      )
      .filter(
        (entry): entry is GitHubInstallationRepository => entry !== null
      );

    repositories.push(...parsedBatch);

    if (batch.length < 100) break;
  }

  return repositories;
}
