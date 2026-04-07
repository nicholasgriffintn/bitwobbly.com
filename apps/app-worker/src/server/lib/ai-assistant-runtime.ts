import { env } from "cloudflare:workers";
import { z } from "zod";

import {
  buildTeamAiAssistantContextSnapshot,
  buildTeamAiAssistantContextSummary,
  buildTeamAiAssistantMessages,
  countTeamAiAssistantRunsSince,
  createTeamAiAssistantRun,
  extractAiUsageFromResponsePayload,
  extractAiTextResponse,
  getTeamAiAssistantSettings,
  getDb,
  makeAiActionTriggerEvent,
  nowIso,
  parseAiUsageFromSsePayload,
  toAiActionTriggerMessage,
  type TeamAiAssistantRun,
} from "@bitwobbly/shared";
import {
  consumeSseByteStream,
  encodeSseDataEvent,
  encodeSseDoneEvent,
  mergeStreamToken,
  parseAiSsePayload,
} from "@/lib/ai-sse";
import { isAbortError } from "@/lib/abort-utils";
import { toErrorMessage } from "@/server/lib/error-utils";
import { isReadableByteStream } from "./stream-utils";

const SupportedModelSchema = z.enum(["@cf/moonshotai/kimi-k2.5"]);

type SupportedModel = z.infer<typeof SupportedModelSchema>;
type AssistantMode = "query" | "audit";
type AssistantRunType = "manual_query" | "manual_audit";

type AssistantExecutionInput = {
  teamId: string;
  mode: AssistantMode;
  runType: AssistantRunType;
  question: string;
};

type AssistantExecutionContext = {
  db: ReturnType<typeof getDb>;
  teamId: string;
  model: SupportedModel;
  runType: AssistantRunType;
  question: string;
  contextSummary: Record<string, unknown>;
  aiInput: Record<string, unknown>;
};

export type AiAssistantClientRun = Omit<
  TeamAiAssistantRun,
  "contextSummary" | "tokenUsage" | "diffSummary"
> & {
  contextSummary: null;
  tokenUsage: null;
  diffSummary: null;
};

function toSupportedModel(input: string): SupportedModel {
  const result = SupportedModelSchema.safeParse(input.trim());
  if (result.success) return result.data;
  return "@cf/moonshotai/kimi-k2.5";
}

function invokeAiRun(
  ai: Ai,
  model: string,
  input: Record<string, unknown>
): Promise<unknown> {
  // @ts-expect-error - we have a limited set of models.
  return ai.run(model, input);
}

async function enforceManualAuditRateLimit(
  db: ReturnType<typeof getDb>,
  input: {
    teamId: string;
    runType: AssistantRunType;
    manualAuditRateLimitPerHour: number;
  }
): Promise<void> {
  if (input.runType !== "manual_audit") return;
  const windowStartedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const runCount = await countTeamAiAssistantRunsSince(db, {
    teamId: input.teamId,
    runType: "manual_audit",
    createdAfterIso: windowStartedAt,
  });
  if (runCount >= input.manualAuditRateLimitPerHour) {
    throw new Error("Rate limit exceeded");
  }
}

async function persistAssistantRun(
  execution: AssistantExecutionContext,
  input: {
    status: "completed" | "failed" | "cancelled";
    answer: string;
    error?: string | null;
    cancelledAt?: string | null;
    partialAnswer?: string | null;
    latencyMs?: number | null;
    tokenUsage?: Record<string, unknown> | null;
    previousRunId?: string | null;
    diffSummary?: Record<string, unknown> | null;
  }
): Promise<void> {
  const run = await createTeamAiAssistantRun(execution.db, {
    teamId: execution.teamId,
    runType: execution.runType,
    question: execution.question,
    answer: input.answer,
    model: execution.model,
    status: input.status,
    error: input.error ?? null,
    cancelledAt: input.cancelledAt ?? null,
    partialAnswer: input.partialAnswer ?? null,
    latencyMs: input.latencyMs ?? null,
    tokenUsage: input.tokenUsage ?? null,
    previousRunId: input.previousRunId ?? null,
    diffSummary: input.diffSummary ?? null,
    contextSummary: execution.contextSummary,
  });

  if (execution.runType === "manual_audit" && input.status === "completed") {
    const queue = (
      env as unknown as {
        ACTION_TRIGGER_JOBS?: { send: (body: unknown) => Promise<void> };
      }
    ).ACTION_TRIGGER_JOBS;
    if (queue) {
      await queue.send(
        toAiActionTriggerMessage(
          makeAiActionTriggerEvent({
            source: "assistant_audit",
            type: "audit_completed",
            teamId: execution.teamId,
            idempotencyKey: `manual_audit:${run.id}`,
            metadata: {
              runId: run.id,
              runType: run.runType,
            },
          })
        )
      );
    }
  }
}

export function toAiAssistantClientRun(
  run: TeamAiAssistantRun
): AiAssistantClientRun {
  return {
    ...run,
    contextSummary: null,
    tokenUsage: null,
    diffSummary: null,
  };
}

async function buildExecutionContext(
  input: AssistantExecutionInput
): Promise<AssistantExecutionContext> {
  const db = getDb(env.DB);
  const settings = await getTeamAiAssistantSettings(db, input.teamId);
  if (!settings.enabled) {
    throw new Error("AI assistant is disabled. Enable it in Settings.");
  }
  await enforceManualAuditRateLimit(db, {
    teamId: input.teamId,
    runType: input.runType,
    manualAuditRateLimitPerHour: settings.manualAuditRateLimitPerHour,
  });

  const model = toSupportedModel(settings.model);
  const question = input.question.trim();
  const snapshot = await buildTeamAiAssistantContextSnapshot(
    db,
    input.teamId,
    settings
  );
  const messages = buildTeamAiAssistantMessages({
    mode: input.mode,
    question,
    customInstructions: settings.customInstructions,
    snapshot,
  });

  return {
    db,
    teamId: input.teamId,
    model,
    runType: input.runType,
    question,
    contextSummary: buildTeamAiAssistantContextSummary(snapshot),
    aiInput: {
      messages,
      temperature: 0.2,
      max_completion_tokens: input.mode === "audit" ? 3600 : 2700,
    },
  };
}

export async function runAssistantOnce(
  input: AssistantExecutionInput,
  ai: Ai
): Promise<{ answer: string; run: AiAssistantClientRun }> {
  const startedAtMs = Date.now();
  const execution = await buildExecutionContext(input);
  try {
    const rawResponse = await invokeAiRun(ai, execution.model, execution.aiInput);
    const answer = extractAiTextResponse(rawResponse).trim();
    if (!answer) {
      throw new Error("Workers AI returned an empty response");
    }

    const run = await createTeamAiAssistantRun(execution.db, {
      teamId: execution.teamId,
      runType: execution.runType,
      question: execution.question,
      answer,
      model: execution.model,
      status: "completed",
      latencyMs: Date.now() - startedAtMs,
      tokenUsage: extractAiUsageFromResponsePayload(rawResponse),
      contextSummary: execution.contextSummary,
    });

    return { answer, run: toAiAssistantClientRun(run) };
  } catch (error) {
    await persistAssistantRun(execution, {
      status: "failed",
      answer: "",
      error: toErrorMessage(error, String(error)),
      latencyMs: Date.now() - startedAtMs,
    });
    throw error;
  }
}

export async function createAssistantQueryStreamResponse(input: {
  teamId: string;
  question: string;
  mode?: AssistantMode;
  runType?: AssistantRunType;
  requestSignal?: AbortSignal;
  ai: Ai;
}): Promise<Response> {
  const startedAtMs = Date.now();
  const mode = input.mode ?? "query";
  const runType = input.runType ?? "manual_query";
  const execution = await buildExecutionContext({
    teamId: input.teamId,
    mode,
    runType,
    question: input.question,
  });

  let rawResponse: unknown;
  try {
    rawResponse = await invokeAiRun(input.ai, execution.model, {
      ...execution.aiInput,
      stream: true,
    });
  } catch (error) {
    await persistAssistantRun(execution, {
      status: "failed",
      answer: "",
      error: toErrorMessage(error, String(error)),
      latencyMs: Date.now() - startedAtMs,
    });
    throw error;
  }

  if (isReadableByteStream(rawResponse)) {
    const streamAbortController = new AbortController();
    const abortFromRequestSignal = () => {
      streamAbortController.abort();
    };
    input.requestSignal?.addEventListener("abort", abortFromRequestSignal, {
      once: true,
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let sawDone = false;
        let answer = "";
        let tokenUsage: Record<string, unknown> | null = null;

        try {
          await consumeSseByteStream(
            rawResponse,
            (payload) => {
              if (streamAbortController.signal.aborted) {
                return;
              }
              const usage = parseAiUsageFromSsePayload(payload);
              if (usage) {
                tokenUsage = usage;
              }
              const parsed = parseAiSsePayload(payload);
              if (parsed.done) {
                sawDone = true;
                controller.enqueue(encodeSseDoneEvent());
                return;
              }

              const merged = mergeStreamToken(answer, parsed.answerToken);
              answer = merged.next;
              controller.enqueue(encodeSseDataEvent(payload));
            },
            { signal: streamAbortController.signal }
          );

          if (streamAbortController.signal.aborted) {
            const partial = answer.trim();
            await persistAssistantRun(execution, {
              status: "cancelled",
              answer: partial,
              cancelledAt: nowIso(),
              partialAnswer: partial || null,
              latencyMs: Date.now() - startedAtMs,
              tokenUsage,
            });
            return;
          }

          if (!sawDone) {
            controller.enqueue(encodeSseDoneEvent());
          }

          const trimmedAnswer = answer.trim();
          if (!trimmedAnswer) {
            throw new Error("Workers AI returned an empty response");
          }

          await persistAssistantRun(execution, {
            status: "completed",
            answer: trimmedAnswer,
            latencyMs: Date.now() - startedAtMs,
            tokenUsage,
          });

          controller.close();
        } catch (error) {
          if (isAbortError(error)) {
            const partial = answer.trim();
            await persistAssistantRun(execution, {
              status: "cancelled",
              answer: partial,
              cancelledAt: nowIso(),
              partialAnswer: partial || null,
              latencyMs: Date.now() - startedAtMs,
              tokenUsage,
            });
            return;
          }
          const partial = answer.trim();
          await persistAssistantRun(execution, {
            status: "failed",
            answer: partial,
            error: toErrorMessage(error, String(error)),
            partialAnswer: partial || null,
            latencyMs: Date.now() - startedAtMs,
            tokenUsage,
          });
          controller.error(
            error instanceof Error ? error : new Error(String(error))
          );
        } finally {
          input.requestSignal?.removeEventListener(
            "abort",
            abortFromRequestSignal
          );
        }
      },
      cancel() {
        streamAbortController.abort();
        input.requestSignal?.removeEventListener(
          "abort",
          abortFromRequestSignal
        );
        return undefined;
      },
    });

    if (input.requestSignal?.aborted) {
      streamAbortController.abort();
    }

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const answer = extractAiTextResponse(rawResponse).trim();
  try {
    if (!answer) {
      throw new Error("Workers AI returned an empty response");
    }

    await persistAssistantRun(execution, {
      status: "completed",
      answer,
      latencyMs: Date.now() - startedAtMs,
      tokenUsage: extractAiUsageFromResponsePayload(rawResponse),
    });
  } catch (error) {
    await persistAssistantRun(execution, {
      status: "failed",
      answer: "",
      error: toErrorMessage(error, String(error)),
      latencyMs: Date.now() - startedAtMs,
      tokenUsage: extractAiUsageFromResponsePayload(rawResponse),
    });
    throw error;
  }

  const fallbackStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encodeSseDataEvent(JSON.stringify({ response: answer }))
      );
      controller.enqueue(encodeSseDoneEvent());
      controller.close();
    },
  });

  return new Response(fallbackStream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
