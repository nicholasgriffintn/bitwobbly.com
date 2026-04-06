import { env } from "cloudflare:workers";
import { z } from "zod";

import {
  buildTeamAiAssistantContextSnapshot,
  buildTeamAiAssistantContextSummary,
  buildTeamAiAssistantMessages,
  createTeamAiAssistantRun,
  extractAiTextResponse,
  getTeamAiAssistantSettings,
  getDb,
  type TeamAiAssistantRun,
} from "@bitwobbly/shared";
import { encodeSseDataEvent, encodeSseDoneEvent } from "@/lib/ai-sse";
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

export type AiAssistantClientRun = {
  id: string;
  teamId: string;
  runType: "manual_query" | "manual_audit" | "auto_audit";
  question: string | null;
  answer: string;
  model: string;
  contextSummary: null;
  createdAt: string;
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

export function toAiAssistantClientRun(
  run: TeamAiAssistantRun
): AiAssistantClientRun {
  return {
    ...run,
    contextSummary: null,
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
  const execution = await buildExecutionContext(input);
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
    contextSummary: execution.contextSummary,
  });

  return { answer, run: toAiAssistantClientRun(run) };
}

export async function createAssistantQueryStreamResponse(input: {
  teamId: string;
  question: string;
  ai: Ai;
}): Promise<Response> {
  const execution = await buildExecutionContext({
    teamId: input.teamId,
    mode: "query",
    runType: "manual_query",
    question: input.question,
  });

  const rawResponse = await invokeAiRun(input.ai, execution.model, {
    ...execution.aiInput,
    stream: true,
  });

  if (isReadableByteStream(rawResponse)) {
    return new Response(rawResponse, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const answer = extractAiTextResponse(rawResponse).trim();
  if (!answer) {
    throw new Error("Workers AI returned an empty response");
  }

  await createTeamAiAssistantRun(execution.db, {
    teamId: execution.teamId,
    runType: execution.runType,
    question: execution.question,
    answer,
    model: execution.model,
    contextSummary: execution.contextSummary,
  });

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
