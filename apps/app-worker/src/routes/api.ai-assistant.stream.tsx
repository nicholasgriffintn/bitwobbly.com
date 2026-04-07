import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { requireTeam } from "@/server/lib/auth-middleware";
import {
  isRateLimitError,
  isRedirectError,
  toErrorMessage,
} from "@/server/lib/error-utils";
import {
  PayloadTooLargeError,
  readJsonWithLimit,
} from "@/server/lib/request-utils";
import { createAssistantQueryStreamResponse } from "@/server/lib/ai-assistant-runtime";

const MAX_REQUEST_BODY_BYTES = 32 * 1024;

const AskAiAssistantRequestSchema = z.object({
  question: z.string().min(3).max(6_000),
  mode: z.enum(["query", "audit"]).optional(),
});

export const Route = createFileRoute("/api/ai-assistant/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await readJsonWithLimit(request, MAX_REQUEST_BODY_BYTES);
          const data = AskAiAssistantRequestSchema.parse(body);
          const { teamId } = await requireTeam();
          const ai = env.AI;

          return await createAssistantQueryStreamResponse({
            teamId,
            question: data.question.trim(),
            mode: data.mode,
            runType: data.mode === "audit" ? "manual_audit" : "manual_query",
            requestSignal: request.signal,
            ai,
          });
        } catch (error) {
          if (error instanceof PayloadTooLargeError) {
            return Response.json(
              { ok: false, error: "Request body is too large" },
              { status: 413 }
            );
          }
          if (error instanceof z.ZodError || error instanceof SyntaxError) {
            return Response.json(
              { ok: false, error: "Invalid request payload" },
              { status: 400 }
            );
          }
          if (isRedirectError(error)) {
            return Response.json(
              { ok: false, error: "Authentication required" },
              { status: 401 }
            );
          }
          if (isRateLimitError(error)) {
            return Response.json(
              { ok: false, error: "Rate limit exceeded" },
              {
                status: 429,
                headers: { "Retry-After": "60" },
              }
            );
          }
          return Response.json(
            { ok: false, error: toErrorMessage(error) },
            { status: 500 }
          );
        }
      },
    },
  },
});
