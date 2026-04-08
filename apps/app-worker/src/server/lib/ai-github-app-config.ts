import { env } from "cloudflare:workers";

import { toNonEmptyString, type GitHubAppCredentials } from "@bitwobbly/shared";

export type GitHubAppConfig = {
  credentials: GitHubAppCredentials;
  installUrl: string;
  appSlug: string | null;
};

function normaliseInstallUrl(value: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error("GITHUB_APP_INSTALL_URL must use https");
  }
  if (parsed.hostname !== "github.com") {
    throw new Error("GITHUB_APP_INSTALL_URL must point to github.com");
  }
  if (!parsed.pathname.startsWith("/apps/")) {
    throw new Error("GITHUB_APP_INSTALL_URL must be a GitHub App install URL");
  }
  return parsed;
}

function extractAppSlug(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2 || segments[0] !== "apps") {
    return null;
  }
  return segments[1] || null;
}

export function getGitHubAppConfig(): GitHubAppConfig {
  const appId = toNonEmptyString(env.GITHUB_APP_ID);
  const appPrivateKeyPem = toNonEmptyString(env.GITHUB_APP_PRIVATE_KEY);
  const installUrlRaw = toNonEmptyString(env.GITHUB_APP_INSTALL_URL);

  if (!appId || !appPrivateKeyPem) {
    throw new Error("Missing GitHub App credentials");
  }
  if (!installUrlRaw) {
    throw new Error("Missing GITHUB_APP_INSTALL_URL");
  }

  const installUrl = normaliseInstallUrl(installUrlRaw);

  return {
    credentials: {
      appId,
      appPrivateKeyPem,
    },
    installUrl: installUrl.toString(),
    appSlug: extractAppSlug(installUrl.pathname),
  };
}
