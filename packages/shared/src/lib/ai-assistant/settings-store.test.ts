import assert from "node:assert/strict";
import test from "node:test";

import type { DB } from "../../db/index.ts";
import { createMockDb } from "../tests/utils/mock-db.ts";
import {
  DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES,
  DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
  DEFAULT_MAX_CONTEXT_ITEMS,
  MAX_AUTO_AUDIT_INTERVAL_MINUTES,
  MAX_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
  MAX_MAX_CONTEXT_ITEMS,
  MIN_AUTO_AUDIT_INTERVAL_MINUTES,
  MIN_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
  MIN_MAX_CONTEXT_ITEMS,
  TEAM_AI_ASSISTANT_DEFAULT_MODEL,
} from "./constants.ts";
import { makeTeamAiAssistantSettingsRowFixture } from "./test-fixtures.ts";
import {
  buildDefaultTeamAiAssistantSettings,
  claimTeamAiAssistantAutoAudit,
  countTeamAiAssistantRunsSince,
  createTeamAiAssistantRun,
  listTeamAiAssistantRuns,
  listTeamsDueForAutoAudit,
  upsertTeamAiAssistantSettings,
} from "./settings-store.ts";

test("buildDefaultTeamAiAssistantSettings returns full default shape", () => {
  const settings = buildDefaultTeamAiAssistantSettings("team_123");

  assert.deepEqual(settings, {
    teamId: "team_123",
    enabled: false,
    model: TEAM_AI_ASSISTANT_DEFAULT_MODEL,
    autoAuditEnabled: false,
    autoAuditIntervalMinutes: DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES,
    manualAuditRateLimitPerHour: DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
    maxContextItems: DEFAULT_MAX_CONTEXT_ITEMS,
    includeIssues: true,
    includeMonitors: true,
    includeComponents: true,
    includeStatusPages: true,
    includeNotifications: true,
    includeGroupingRules: true,
    customInstructions: null,
    lastAutoAuditAt: null,
    createdAt: null,
    updatedAt: null,
  });
});

test("upsertTeamAiAssistantSettings inserts clamped values and defaults", async () => {
  const fakeDb = createMockDb([
    [],
    [
      makeTeamAiAssistantSettingsRowFixture({
        enabled: 1,
        autoAuditEnabled: 1,
        autoAuditIntervalMinutes: MIN_AUTO_AUDIT_INTERVAL_MINUTES,
        manualAuditRateLimitPerHour: DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
        maxContextItems: MAX_MAX_CONTEXT_ITEMS,
        includeIssues: 0,
      }),
    ],
  ]);

  const result = await upsertTeamAiAssistantSettings(fakeDb as unknown as DB, "team_1", {
    enabled: true,
    model: "   ",
    autoAuditEnabled: true,
    autoAuditIntervalMinutes: -500,
    maxContextItems: 999999,
    includeIssues: false,
  });

  assert.equal(fakeDb.inserts.length, 1);
  const inserted = fakeDb.inserts[0].value as Record<string, unknown>;
  assert.equal(inserted.model, TEAM_AI_ASSISTANT_DEFAULT_MODEL);
  assert.equal(inserted.autoAuditIntervalMinutes, MIN_AUTO_AUDIT_INTERVAL_MINUTES);
  assert.equal(
    inserted.manualAuditRateLimitPerHour,
    DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR
  );
  assert.equal(inserted.maxContextItems, MAX_MAX_CONTEXT_ITEMS);
  assert.equal(inserted.includeIssues, 0);
  assert.equal(result.autoAuditIntervalMinutes, MIN_AUTO_AUDIT_INTERVAL_MINUTES);
  assert.equal(result.maxContextItems, MAX_MAX_CONTEXT_ITEMS);
  assert.equal(result.includeIssues, false);
});

test("upsertTeamAiAssistantSettings updates only provided values and clamps ranges", async () => {
  const existing = makeTeamAiAssistantSettingsRowFixture({
    autoAuditIntervalMinutes: DEFAULT_AUTO_AUDIT_INTERVAL_MINUTES,
    manualAuditRateLimitPerHour: DEFAULT_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
    maxContextItems: DEFAULT_MAX_CONTEXT_ITEMS,
  });
  const updated = makeTeamAiAssistantSettingsRowFixture({
    autoAuditIntervalMinutes: MAX_AUTO_AUDIT_INTERVAL_MINUTES,
    manualAuditRateLimitPerHour: MIN_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
    maxContextItems: MIN_MAX_CONTEXT_ITEMS,
    includeMonitors: 0,
  });
  const fakeDb = createMockDb([[existing], [updated]]);

  const result = await upsertTeamAiAssistantSettings(fakeDb as unknown as DB, "team_1", {
    autoAuditIntervalMinutes: 999999,
    manualAuditRateLimitPerHour: -20,
    maxContextItems: 0,
    includeMonitors: false,
  });

  assert.equal(fakeDb.updates.length, 1);
  const updateSet = fakeDb.updates[0].value as Record<string, unknown>;
  assert.equal(updateSet.autoAuditIntervalMinutes, MAX_AUTO_AUDIT_INTERVAL_MINUTES);
  assert.equal(
    updateSet.manualAuditRateLimitPerHour,
    MIN_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR
  );
  assert.equal(updateSet.maxContextItems, MIN_MAX_CONTEXT_ITEMS);
  assert.equal(updateSet.includeMonitors, 0);
  assert.equal(result.autoAuditIntervalMinutes, MAX_AUTO_AUDIT_INTERVAL_MINUTES);
  assert.equal(result.includeMonitors, false);
});

test("listTeamAiAssistantRuns maps persisted rows to public run shape", async () => {
  const fakeDb = createMockDb([
    [
      {
        id: "tai_1",
        teamId: "team_1",
        runType: "manual_audit",
        status: "failed",
        question: "q",
        answer: "a",
        model: TEAM_AI_ASSISTANT_DEFAULT_MODEL,
        error: "boom",
        cancelledAt: null,
        partialAnswer: "partial",
        latencyMs: 123,
        tokenUsageJson: { total_tokens: 10 },
        previousRunId: "tai_prev",
        diffSummaryJson: { changed: 2 },
        contextSummary: { monitors: 1 },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  ]);

  const runs = await listTeamAiAssistantRuns(fakeDb as unknown as DB, "team_1");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runType, "manual_audit");
  assert.equal(runs[0].status, "failed");
  assert.equal(runs[0].error, "boom");
  assert.deepEqual(runs[0].tokenUsage, { total_tokens: 10 });
});

test("createTeamAiAssistantRun defaults status to completed", async () => {
  const fakeDb = createMockDb([]);
  const run = await createTeamAiAssistantRun(fakeDb as unknown as DB, {
    teamId: "team_1",
    runType: "manual_query",
    question: "How are monitors doing?",
    answer: "All good.",
    model: TEAM_AI_ASSISTANT_DEFAULT_MODEL,
  });

  assert.equal(run.status, "completed");
  assert.equal(fakeDb.inserts.length, 1);
  const inserted = fakeDb.inserts[0].value as Record<string, unknown>;
  assert.equal(inserted.status, "completed");
});

test("countTeamAiAssistantRunsSince returns numeric count", async () => {
  const fakeDb = createMockDb([[{ count: "2" }]]);
  const count = await countTeamAiAssistantRunsSince(fakeDb as unknown as DB, {
    teamId: "team_1",
    runType: "manual_audit",
    createdAfterIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(count, 2);
});

test("listTeamsDueForAutoAudit filters by schedule and applies limit", async () => {
  const nowSec = 10_000;
  const fakeDb = createMockDb([
    [
      makeTeamAiAssistantSettingsRowFixture({
        teamId: "team_due_oldest",
        lastAutoAuditAt: nowSec - 20_000,
        autoAuditIntervalMinutes: 30,
      }),
      makeTeamAiAssistantSettingsRowFixture({
        teamId: "team_not_due",
        lastAutoAuditAt: nowSec - 60,
        autoAuditIntervalMinutes: 30,
      }),
      makeTeamAiAssistantSettingsRowFixture({
        teamId: "team_due_newer",
        lastAutoAuditAt: nowSec - 3_000,
        autoAuditIntervalMinutes: 15,
      }),
    ],
  ]);

  const due = await listTeamsDueForAutoAudit(
    fakeDb as unknown as DB,
    nowSec,
    1
  );

  assert.equal(due.length, 1);
  assert.equal(due[0].teamId, "team_due_oldest");
});

test("claimTeamAiAssistantAutoAudit reflects update row change result", async () => {
  const fakeDb = createMockDb(
    [],
    [{ meta: { changes: 1 } }, { meta: { changes: 0 } }]
  );

  const claimed = await claimTeamAiAssistantAutoAudit(
    fakeDb as unknown as DB,
    "team_1",
    1000,
    100
  );
  const notClaimed = await claimTeamAiAssistantAutoAudit(
    fakeDb as unknown as DB,
    "team_1",
    1000,
    100
  );

  assert.equal(claimed, true);
  assert.equal(notClaimed, false);
});

test("manual audit rate limit is clamped when explicitly updated", async () => {
  const existing = makeTeamAiAssistantSettingsRowFixture();
  const updated = makeTeamAiAssistantSettingsRowFixture({
    manualAuditRateLimitPerHour: MAX_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR,
  });
  const fakeDb = createMockDb([[existing], [updated]]);

  const result = await upsertTeamAiAssistantSettings(fakeDb as unknown as DB, "team_1", {
    manualAuditRateLimitPerHour: 999,
  });

  assert.equal(
    result.manualAuditRateLimitPerHour,
    MAX_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR
  );
  const updateSet = fakeDb.updates[0].value as Record<string, unknown>;
  assert.equal(
    updateSet.manualAuditRateLimitPerHour,
    MAX_MANUAL_AUDIT_RATE_LIMIT_PER_HOUR
  );
});
