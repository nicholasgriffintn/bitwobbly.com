import {
  createGitHubAppJwt,
  gitHubApiRequest,
  isRecord,
  shouldAllowEgress,
  toNonEmptyString,
  type TeamAiActionPolicy,
} from "@bitwobbly/shared";

type GithubRequestInput = {
  policy: TeamAiActionPolicy;
  url: string;
  authToken: string;
  method?: string;
  body?: Record<string, unknown>;
};

type InstallationTokenInput = {
  policy: TeamAiActionPolicy;
  appId: string;
  appPrivateKeyPem: string;
  installationId: number;
};

function toGithubMethod(
  method: string | undefined
): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" {
  if (!method || method === "GET") return "GET";
  if (method === "POST") return "POST";
  if (method === "PUT") return "PUT";
  if (method === "PATCH") return "PATCH";
  if (method === "DELETE") return "DELETE";
  throw new Error(`Unsupported GitHub method: ${method}`);
}

export async function githubRequest(input: GithubRequestInput): Promise<unknown> {
  if (!shouldAllowEgress(input.url, input.policy.egressAllowlist)) {
    throw new Error(`Egress blocked by allowlist: ${input.url}`);
  }

  const parsedUrl = new URL(input.url);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "api.github.com") {
    throw new Error(`Unsupported GitHub API host: ${parsedUrl.hostname}`);
  }
  return gitHubApiRequest({
    authToken: input.authToken,
    method: toGithubMethod(input.method),
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    body: input.body,
  });
}

export async function createGithubInstallationToken(
  input: InstallationTokenInput
): Promise<string> {
  const appToken = await createGitHubAppJwt({
    appId: input.appId,
    appPrivateKeyPem: input.appPrivateKeyPem,
  });

  const tokenResponse = await githubRequest({
    policy: input.policy,
    authToken: appToken,
    method: "POST",
    url: `https://api.github.com/app/installations/${input.installationId}/access_tokens`,
    body: {
      permissions: {
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
