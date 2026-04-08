import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitHubInstallStateToken,
  verifyGitHubInstallStateToken,
} from "./ai-github-app-state.ts";

const SESSION_SECRET = "test-session-secret";

test("GitHub install state verifies for matching team and user", async () => {
  const token = await createGitHubInstallStateToken({
    sessionSecret: SESSION_SECRET,
    teamId: "team_123",
    userId: "user_123",
  });

  await verifyGitHubInstallStateToken({
    sessionSecret: SESSION_SECRET,
    token,
    expectedTeamId: "team_123",
    expectedUserId: "user_123",
  });
});

test("GitHub install state rejects mismatched team", async () => {
  const token = await createGitHubInstallStateToken({
    sessionSecret: SESSION_SECRET,
    teamId: "team_a",
    userId: "user_a",
  });

  await assert.rejects(
    verifyGitHubInstallStateToken({
      sessionSecret: SESSION_SECRET,
      token,
      expectedTeamId: "team_b",
      expectedUserId: "user_a",
    }),
    /team mismatch/
  );
});

test("GitHub install state rejects tampering", async () => {
  const token = await createGitHubInstallStateToken({
    sessionSecret: SESSION_SECRET,
    teamId: "team_123",
    userId: "user_123",
  });
  const [payload] = token.split(".");
  const tampered = `${payload}.deadbeef`;

  await assert.rejects(
    verifyGitHubInstallStateToken({
      sessionSecret: SESSION_SECRET,
      token: tampered,
      expectedTeamId: "team_123",
      expectedUserId: "user_123",
    }),
    /signature mismatch/
  );
});
