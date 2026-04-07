import {
  findTeamAiGithubRepoMappingByProject,
  getDb,
  isPathAllowedByPrefixes,
  isRecord,
  shouldAllowEgress,
  toFiniteNumber,
  toNonEmptyString,
  utf8ToBase64,
  type TeamAiAction,
  type TeamAiActionPolicy,
} from "@bitwobbly/shared";

import type { Env } from "../../types/env";

type GithubFileChange = {
  path: string;
  content: string;
};

type ActionInput = {
  env: Env;
  action: TeamAiAction;
  policy: TeamAiActionPolicy;
};

async function githubRequest(input: {
  env: Env;
  policy: TeamAiActionPolicy;
  url: string;
  method?: string;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  if (!shouldAllowEgress(input.url, input.policy.egressAllowlist)) {
    throw new Error(`Egress blocked by allowlist: ${input.url}`);
  }
  if (!input.env.GITHUB_TOKEN) {
    throw new Error("Missing GITHUB_TOKEN configuration");
  }

  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${input.env.GITHUB_TOKEN}`,
      "x-github-api-version": "2022-11-28",
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

function parseAutofixFiles(payload: Record<string, unknown>): GithubFileChange[] {
  const filesValue = payload.files;
  if (!Array.isArray(filesValue) || filesValue.length === 0) {
    throw new Error("github_autofix payload must include files");
  }

  const files = filesValue
    .map((item) => {
      if (!isRecord(item)) return null;
      const path = toNonEmptyString(item.path);
      const content = toNonEmptyString(item.content);
      if (!path || content === null) return null;
      return { path, content };
    })
    .filter((value): value is GithubFileChange => value !== null);

  if (!files.length) {
    throw new Error("github_autofix payload files are invalid");
  }

  return files;
}

async function resolveBaseBranchSha(input: {
  env: Env;
  policy: TeamAiActionPolicy;
  repoUrl: string;
  baseBranch: string;
}): Promise<string> {
  const refHead = await githubRequest({
    env: input.env,
    policy: input.policy,
    url: `${input.repoUrl}/git/ref/heads/${input.baseBranch}`,
  });

  if (!isRecord(refHead) || !isRecord(refHead.object)) {
    throw new Error(`Could not resolve ref object for ${input.baseBranch}`);
  }

  const baseSha = toNonEmptyString(refHead.object.sha);
  if (!baseSha) {
    throw new Error(`Could not resolve base SHA for ${input.baseBranch}`);
  }
  return baseSha;
}

async function resolveFileSha(input: {
  env: Env;
  policy: TeamAiActionPolicy;
  repoUrl: string;
  filePath: string;
  branchName: string;
}): Promise<string | null> {
  try {
    const existing = await githubRequest({
      env: input.env,
      policy: input.policy,
      url: `${input.repoUrl}/contents/${encodeURIComponent(input.filePath)}?ref=${encodeURIComponent(input.branchName)}`,
    });
    if (!isRecord(existing)) return null;
    return toNonEmptyString(existing.sha);
  } catch {
    return null;
  }
}

export async function executeGithubAutofixAction(
  input: ActionInput
): Promise<Record<string, unknown>> {
  const payload = input.action.payload ?? {};
  const teamId = input.action.teamId;
  const projectId = toNonEmptyString(payload.projectId) ?? null;

  const db = getDb(input.env.DB, { withSentry: true });
  const mapping = await findTeamAiGithubRepoMappingByProject(db, {
    teamId,
    projectId,
  });

  if (!mapping || !mapping.enabled) {
    throw new Error("No enabled GitHub mapping configured for this action");
  }

  const files = parseAutofixFiles(payload);
  if (files.length > mapping.maxFilesChanged) {
    throw new Error(
      `github_autofix exceeds max files (${files.length}/${mapping.maxFilesChanged})`
    );
  }

  for (const file of files) {
    if (!isPathAllowedByPrefixes(file.path, mapping.pathAllowlist)) {
      throw new Error(`Path '${file.path}' is outside configured allowlist`);
    }
    if (new TextEncoder().encode(file.content).length > mapping.maxPatchBytes) {
      throw new Error(
        `File '${file.path}' exceeds max patch bytes (${mapping.maxPatchBytes})`
      );
    }
  }

  const owner = mapping.repositoryOwner;
  const repo = mapping.repositoryName;
  const baseBranch = mapping.defaultBranch;
  const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const branchName = `bitwobbly/autofix-${Date.now()}-${input.action.id.slice(-6)}`;

  const baseSha = await resolveBaseBranchSha({
    env: input.env,
    policy: input.policy,
    repoUrl,
    baseBranch,
  });

  await githubRequest({
    env: input.env,
    policy: input.policy,
    url: `${repoUrl}/git/refs`,
    method: "POST",
    body: {
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    },
  });

  for (const file of files) {
    const existingSha = await resolveFileSha({
      env: input.env,
      policy: input.policy,
      repoUrl,
      filePath: file.path,
      branchName,
    });
    await githubRequest({
      env: input.env,
      policy: input.policy,
      url: `${repoUrl}/contents/${encodeURIComponent(file.path)}`,
      method: "PUT",
      body: {
        message: `chore(ai): autofix ${file.path}`,
        branch: branchName,
        content: utf8ToBase64(file.content),
        sha: existingSha ?? undefined,
      },
    });
  }

  const title =
    toNonEmptyString(payload.prTitle) ?? `AI autofix (${new Date().toISOString()})`;
  const body =
    toNonEmptyString(payload.prBody) ??
    "Automated AI-generated fix created via BitWobbly AI sandbox.";
  const pr = await githubRequest({
    env: input.env,
    policy: input.policy,
    url: `${repoUrl}/pulls`,
    method: "POST",
    body: {
      title,
      body,
      head: branchName,
      base: baseBranch,
      draft: true,
    },
  });

  const pullRequestUrl = isRecord(pr) ? toNonEmptyString(pr.html_url) : null;
  const pullRequestNumber = isRecord(pr) ? toFiniteNumber(pr.number) : null;

  return {
    repository: `${owner}/${repo}`,
    branch: branchName,
    pullRequestUrl,
    pullRequestNumber,
    filesChanged: files.length,
  };
}
