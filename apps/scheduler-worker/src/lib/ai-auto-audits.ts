import type { DB } from "@bitwobbly/shared";
import {
  buildTeamAiAssistantContextSnapshot,
  buildTeamAiAssistantContextSummary,
  buildTeamAiAssistantMessages,
  claimTeamAiAssistantAutoAudit,
  makeAiActionTriggerEvent,
  createLogger,
  createTeamAiAssistantRun,
  extractAiTextResponse,
  listTeamsDueForAutoAudit,
  serialiseError,
  toAiActionTriggerMessage,
} from "@bitwobbly/shared";

import type { Env } from "../types/env";

const logger = createLogger({ service: "scheduler-worker" });

const AUTO_AUDIT_QUESTION =
  "Generate a monitoring and incident-management audit with prioritised improvements for monitors, notifications, and issue grouping rules.";

export async function runTeamAiAutoAudits(
  db: DB,
  env: Env,
  nowSec: number
): Promise<void> {
  const dueTeams = await listTeamsDueForAutoAudit(db, nowSec, 3);
  if (!dueTeams.length) return;

  for (const { teamId, settings } of dueTeams) {
    const startedAtMs = Date.now();
    try {
      const dueBeforeSec = nowSec - settings.autoAuditIntervalMinutes * 60;
      const claimed = await claimTeamAiAssistantAutoAudit(
        db,
        teamId,
        nowSec,
        dueBeforeSec
      );
      if (!claimed) {
        continue;
      }

      const snapshot = await buildTeamAiAssistantContextSnapshot(
        db,
        teamId,
        settings
      );
      const messages = buildTeamAiAssistantMessages({
        mode: "audit",
        question: AUTO_AUDIT_QUESTION,
        customInstructions: settings.customInstructions,
        snapshot,
      });

      const raw = await env.AI.run(settings.model, {
        messages,
        temperature: 0.2,
        max_completion_tokens: 3600,
      });
      const answer = extractAiTextResponse(raw).trim();
      if (!answer) {
        throw new Error("Workers AI returned an empty audit response");
      }

      const run = await createTeamAiAssistantRun(db, {
        teamId,
        runType: "auto_audit",
        question: AUTO_AUDIT_QUESTION,
        answer,
        model: settings.model,
        status: "completed",
        latencyMs: Date.now() - startedAtMs,
        contextSummary: buildTeamAiAssistantContextSummary(snapshot),
      });

      await env.ACTION_TRIGGER_JOBS.send(
        toAiActionTriggerMessage(
          makeAiActionTriggerEvent({
            source: "assistant_audit",
            type: "audit_completed",
            teamId,
            idempotencyKey: `auto_audit:${run.id}`,
            metadata: {
              runId: run.id,
              runType: run.runType,
            },
          })
        )
      );

      logger.info("generated automated AI audit", {
        teamId,
        model: settings.model,
      });
    } catch (error) {
      try {
        await createTeamAiAssistantRun(db, {
          teamId,
          runType: "auto_audit",
          question: AUTO_AUDIT_QUESTION,
          answer: "",
          model: settings.model,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - startedAtMs,
        });
      } catch {
        // keep failure logging best-effort
      }
      logger.error("automated AI audit failed", {
        teamId,
        error: serialiseError(error),
      });
    }
  }
}
