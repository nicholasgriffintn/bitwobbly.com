import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardTitle } from "@/components/layout";
import { ListContainer, ListRow } from "@/components/list";
import { Button } from "@/components/ui";
import {
  completeAiGithubAppInstallFn,
  deleteAiGithubMappingFn,
  getAiGithubAppInstallUrlFn,
  listAiGithubInstallationReposFn,
  listAiGithubInstallationsFn,
  listAiGithubMappingsFn,
  upsertAiGithubMappingFn,
} from "@/server/functions/ai-actions";
import { listSentryProjectsFn } from "@/server/functions/sentry";
import {
  clearGitHubInstallCallbackParams,
  parseGitHubInstallCallbackParams,
} from "./lib/github-app-callback";

type AiGithubMapping = {
  id: string;
  projectId: string | null;
  installationId: number | null;
  repositoryOwner: string;
  repositoryName: string;
  defaultBranch: string;
  pathAllowlist: string[];
  maxFilesChanged: number;
  maxPatchBytes: number;
  enabled: boolean;
};

type AiGithubInstallation = {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  targetType: string;
  repositorySelection: "all" | "selected" | "unknown";
};

type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  ownerLogin: string;
  defaultBranch: string;
  isPrivate: boolean;
};

type MappingFormState = {
  projectId: string;
  installationId: string;
  repositoryFullName: string;
  defaultBranch: string;
  pathAllowlist: string;
  maxFilesChanged: string;
  maxPatchBytes: string;
  enabled: boolean;
};

const DEFAULT_FORM: MappingFormState = {
  projectId: "",
  installationId: "",
  repositoryFullName: "",
  defaultBranch: "main",
  pathAllowlist: "",
  maxFilesChanged: "12",
  maxPatchBytes: "50000",
  enabled: true,
};

type TeamProject = {
  id: string;
  name: string;
};

type PendingGitHubInstall = {
  installationId: number;
  setupAction: string | null;
};

export function AiGithubMappingsCard() {
  const [mappings, setMappings] = useState<AiGithubMapping[]>([]);
  const [installations, setInstallations] = useState<AiGithubInstallation[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [form, setForm] = useState<MappingFormState>(DEFAULT_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isConnectingApp, setIsConnectingApp] = useState(false);
  const [pendingInstall, setPendingInstall] = useState<PendingGitHubInstall | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasHandledCallbackRef = useRef(false);

  const listMappings = useServerFn(listAiGithubMappingsFn);
  const listInstallations = useServerFn(listAiGithubInstallationsFn);
  const listInstallationRepos = useServerFn(listAiGithubInstallationReposFn);
  const getInstallUrl = useServerFn(getAiGithubAppInstallUrlFn);
  const completeInstall = useServerFn(completeAiGithubAppInstallFn);
  const listProjects = useServerFn(listSentryProjectsFn);
  const upsertMapping = useServerFn(upsertAiGithubMappingFn);
  const deleteMapping = useServerFn(deleteAiGithubMappingFn);

  const projectNameById = useMemo(() => {
    const pairs = projects.map((project) => [project.id, project.name] as const);
    return new Map(pairs);
  }, [projects]);

  const installationLabelById = useMemo(() => {
    return new Map(
      installations.map((installation) => [
        installation.installationId,
        `${installation.accountLogin} (${installation.targetType.toLowerCase()})`,
      ])
    );
  }, [installations]);

  const selectedRepository = useMemo(
    () => repositories.find((repo) => repo.fullName === form.repositoryFullName) ?? null,
    [repositories, form.repositoryFullName]
  );

  const refreshProjects = useCallback(async () => {
    const response = await listProjects();
    setProjects(
      response.projects.map((project) => ({
        id: project.id,
        name: project.name,
      }))
    );
  }, [listProjects]);

  const refreshMappings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await listMappings();
      setMappings(response.mappings);
    } finally {
      setIsLoading(false);
    }
  }, [listMappings]);

  const refreshInstallations = useCallback(async () => {
    const response = await listInstallations();
    setInstallations(
      response.installations.map((installation) => ({
        id: installation.id,
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        targetType: installation.targetType,
        repositorySelection: installation.repositorySelection,
      }))
    );
  }, [listInstallations]);

  const refreshInstallUrl = useCallback(async () => {
    const response = await getInstallUrl();
    setInstallUrl(response.installUrl);
  }, [getInstallUrl]);

  useEffect(() => {
    void Promise.all([
      refreshMappings(),
      refreshInstallations(),
      refreshInstallUrl(),
      refreshProjects(),
    ]).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refreshInstallUrl, refreshInstallations, refreshMappings, refreshProjects]);

  useEffect(() => {
    if (hasHandledCallbackRef.current) return;
    hasHandledCallbackRef.current = true;

    const callback = parseGitHubInstallCallbackParams(window.location.search);
    if (!callback) return;

    clearGitHubInstallCallbackParams();
    if (!callback.state) {
      setPendingInstall({
        installationId: callback.installationId,
        setupAction: callback.setupAction,
      });
      setMessage(
        `GitHub returned installation #${callback.installationId}. Confirm below to connect it to this team.`
      );
      return;
    }

    setIsConnectingApp(true);
    setError(null);
    setMessage(null);
    void completeInstall({
      data: {
        installationId: callback.installationId,
        state: callback.state,
        setupAction: callback.setupAction ?? undefined,
      },
    })
      .then(async () => {
        await Promise.all([refreshInstallations(), refreshInstallUrl()]);
        setPendingInstall(null);
        setMessage("GitHub App installation connected.");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setIsConnectingApp(false);
      });
  }, [completeInstall, refreshInstallUrl, refreshInstallations]);

  const onConfirmPendingInstall = async () => {
    if (!pendingInstall) return;
    setIsConnectingApp(true);
    setError(null);
    setMessage(null);
    try {
      await completeInstall({
        data: {
          installationId: pendingInstall.installationId,
          setupAction: pendingInstall.setupAction ?? undefined,
          explicitConfirm: true,
        },
      });
      await Promise.all([refreshInstallations(), refreshInstallUrl()]);
      setPendingInstall(null);
      setMessage("GitHub App installation connected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConnectingApp(false);
    }
  };

  useEffect(() => {
    const installationId = Number(form.installationId);
    if (!Number.isInteger(installationId) || installationId < 1) {
      setRepositories([]);
      setForm((previous) => ({ ...previous, repositoryFullName: "" }));
      return;
    }

    let cancelled = false;
    setIsLoadingRepos(true);
    setError(null);

    void listInstallationRepos({
      data: { installationId },
    })
      .then((response) => {
        if (cancelled) return;
        setRepositories(response.repositories);
        setForm((previous) => {
          const currentExists = response.repositories.some(
            (repo) => repo.fullName === previous.repositoryFullName
          );
          return currentExists
            ? previous
            : {
                ...previous,
                repositoryFullName: "",
              };
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setRepositories([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRepos(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.installationId, listInstallationRepos]);

  const onSave = async () => {
    setError(null);
    setMessage(null);
    setIsSaving(true);
    try {
      const installationId = Number(form.installationId);
      if (!Number.isInteger(installationId) || installationId < 1) {
        throw new Error("Select a GitHub App installation");
      }

      const selectedProjectId = form.projectId.trim();
      if (
        selectedProjectId.length > 0 &&
        !projects.some((project) => project.id === selectedProjectId)
      ) {
        throw new Error("Select a valid project from the list");
      }

      const repository = repositories.find(
        (repo) => repo.fullName === form.repositoryFullName
      );
      if (!repository) {
        throw new Error("Select a repository from the installation");
      }

      await upsertMapping({
        data: {
          projectId: selectedProjectId || null,
          installationId,
          repositoryOwner: repository.ownerLogin,
          repositoryName: repository.name,
          defaultBranch: form.defaultBranch.trim() || repository.defaultBranch || "main",
          pathAllowlist: form.pathAllowlist
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          maxFilesChanged: Number(form.maxFilesChanged),
          maxPatchBytes: Number(form.maxPatchBytes),
          enabled: form.enabled,
        },
      });

      await refreshMappings();
      setForm(DEFAULT_FORM);
      setRepositories([]);
      setMessage("GitHub mapping saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    setMessage(null);
    try {
      await deleteMapping({ data: { id } });
      await refreshMappings();
      setMessage("GitHub mapping deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card>
      <CardTitle>GitHub App Mappings</CardTitle>
      <p className="muted mt-0">
        Install the GitHub App first, then bind team/project scope to a connected
        installation and repository.
      </p>

      {error && <div className="form-error mb-3">{error}</div>}
      {message && <div className="muted mb-3">{message}</div>}

      <div className="button-row mb-3">
        {!pendingInstall ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (installUrl) {
                window.location.href = installUrl;
              }
            }}
            disabled={!installUrl || isConnectingApp}
          >
            {isConnectingApp ? "Connecting..." : "Install / Configure GitHub App"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            color="info"
            onClick={() => void onConfirmPendingInstall()}
            disabled={isConnectingApp}
          >
            Connect returned installation #{pendingInstall.installationId}
          </Button>
        )}
      </div>

      <div className="form">
        <div className="grid two">
          <div className="form-field">
            <label htmlFor="ai-github-mapping-project">Project scope</label>
            <select
              id="ai-github-mapping-project"
              value={form.projectId}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  projectId: event.target.value,
                }))
              }
            >
              <option value="">Team default (no project)</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="ai-github-mapping-installation">Installation</label>
            <select
              id="ai-github-mapping-installation"
              value={form.installationId}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  installationId: event.target.value,
                }))
              }
            >
              <option value="">Select installation</option>
              {installations.map((installation) => (
                <option
                  key={installation.id}
                  value={String(installation.installationId)}
                >
                  {installation.accountLogin} · #{installation.installationId}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="ai-github-mapping-repository">Repository</label>
            <select
              id="ai-github-mapping-repository"
              value={form.repositoryFullName}
              onChange={(event) => {
                const fullName = event.target.value;
                const repo =
                  repositories.find((item) => item.fullName === fullName) ?? null;
                setForm((previous) => ({
                  ...previous,
                  repositoryFullName: fullName,
                  defaultBranch: repo?.defaultBranch ?? previous.defaultBranch,
                }));
              }}
              disabled={!form.installationId || isLoadingRepos}
            >
              <option value="">
                {isLoadingRepos ? "Loading repositories..." : "Select repository"}
              </option>
              {repositories.map((repository) => (
                <option key={repository.id} value={repository.fullName}>
                  {repository.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="ai-github-mapping-branch">Default branch</label>
            <input
              id="ai-github-mapping-branch"
              value={form.defaultBranch}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  defaultBranch: event.target.value,
                }))
              }
              placeholder={selectedRepository?.defaultBranch ?? "main"}
            />
          </div>

          <div className="form-field">
            <label htmlFor="ai-github-mapping-path-allowlist">Path allowlist</label>
            <input
              id="ai-github-mapping-path-allowlist"
              value={form.pathAllowlist}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  pathAllowlist: event.target.value,
                }))
              }
              placeholder="src/, apps/app-worker/src/"
            />
          </div>

          <div className="form-field">
            <label htmlFor="ai-github-mapping-max-files">Max files changed</label>
            <input
              id="ai-github-mapping-max-files"
              type="number"
              min={1}
              value={form.maxFilesChanged}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  maxFilesChanged: event.target.value,
                }))
              }
              placeholder="12"
            />
          </div>

          <div className="form-field">
            <label htmlFor="ai-github-mapping-max-bytes">Max patch bytes</label>
            <input
              id="ai-github-mapping-max-bytes"
              type="number"
              min={1024}
              value={form.maxPatchBytes}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  maxPatchBytes: event.target.value,
                }))
              }
              placeholder="50000"
            />
          </div>
        </div>

        <label className="checkbox" htmlFor="ai-github-mapping-enabled">
          <input
            id="ai-github-mapping-enabled"
            type="checkbox"
            checked={form.enabled}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, enabled: event.target.checked }))
            }
          />
          Mapping enabled
        </label>

        <div className="button-row">
          <Button type="button" variant="outline" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Mapping"}
          </Button>
        </div>

        {isLoading ? (
          <div className="muted">Loading mappings…</div>
        ) : mappings.length === 0 ? (
          <div className="muted">No GitHub mappings configured.</div>
        ) : (
          <ListContainer isEmpty={false}>
            {mappings.map((mapping) => (
              <ListRow
                key={mapping.id}
                isOdd={true}
                title={`${mapping.repositoryOwner}/${mapping.repositoryName}`}
                subtitle={
                  <>
                    <div>
                      install{" "}
                      {mapping.installationId
                        ? installationLabelById.get(mapping.installationId) ??
                          `#${mapping.installationId}`
                        : "unset"}{" "}
                      · project{" "}
                      {mapping.projectId
                        ? projectNameById.get(mapping.projectId) ?? mapping.projectId
                        : "team default"}{" "}
                      · branch {mapping.defaultBranch} ·{" "}
                      {mapping.enabled ? "enabled" : "disabled"}
                    </div>
                    <div>
                      paths: {mapping.pathAllowlist.join(", ") || "(none)"} · limits:{" "}
                      {mapping.maxFilesChanged} files / {mapping.maxPatchBytes} bytes
                    </div>
                  </>
                }
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    color="danger"
                    onClick={() => void onDelete(mapping.id)}
                  >
                    Delete
                  </Button>
                }
              />
            ))}
          </ListContainer>
        )}
      </div>
    </Card>
  );
}
