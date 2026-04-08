export type GitHubInstallCallbackParams = {
  installationId: number;
  state: string | null;
  setupAction: string | null;
};

export function parseGitHubInstallCallbackParams(
  search: string
): GitHubInstallCallbackParams | null {
  const params = new URLSearchParams(search);
  const installationIdRaw = params.get("installation_id");
  if (!installationIdRaw) {
    return null;
  }

  const installationId = Number(installationIdRaw);
  if (!Number.isInteger(installationId) || installationId < 1) {
    return null;
  }

  return {
    installationId,
    state: params.get("state"),
    setupAction: params.get("setup_action"),
  };
}

export function clearGitHubInstallCallbackParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("installation_id");
  url.searchParams.delete("setup_action");
  url.searchParams.delete("state");
  const search = url.searchParams.toString();
  const nextUrl = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  window.history.replaceState({}, "", nextUrl);
}
