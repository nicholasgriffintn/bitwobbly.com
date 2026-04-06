import type { TeamAiAssistantPromptInput } from "./types.ts";

export function buildTeamAiAssistantMessages(
  input: TeamAiAssistantPromptInput
): Array<{ role: "system" | "user"; content: string }> {
  const modeInstruction =
    input.mode === "audit"
      ? "Produce a proactive monitoring configuration audit with prioritised recommendations."
      : "Answer the user query with precise, actionable operations guidance.";

  const customInstructions = (input.customInstructions || "").trim();
  const customBlock = customInstructions
    ? `\nCustom team instructions:\n${customInstructions}`
    : "";

  const system = [
    "You are BitWobbly AI, an operations assistant for monitoring, incidents, and issue triage.",
    "Use the supplied context snapshot as source-of-truth for team state.",
    "If data is missing, say what is missing and what to check next.",
    "Prefer practical actions over theory.",
    "Include concrete advice for monitor setup, issue grouping rules, and notification routing when relevant.",
  ].join(" ");

  const userSegments = [
    modeInstruction,
    input.question?.trim()
      ? `User question:\n${input.question.trim()}`
      : "User question:\nGenerate a concise operations review for this team.",
    "Context snapshot JSON:",
    JSON.stringify(input.snapshot),
    customBlock,
  ].filter(Boolean);

  return [
    { role: "system", content: system },
    { role: "user", content: userSegments.join("\n\n") },
  ];
}
