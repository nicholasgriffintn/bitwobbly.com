import type {
  TeamAiActionPlannerPromptInput,
  TeamAiAssistantPromptInput,
} from "./types.ts";

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

export function buildTeamAiActionPlanMessages(
  input: TeamAiActionPlannerPromptInput
): Array<{ role: "system" | "user"; content: string }> {
  const customInstructions = (input.customInstructions || "").trim();
  const customBlock = customInstructions
    ? `\nTeam-specific instructions:\n${customInstructions}`
    : "";

  const system = [
    "You are BitWobbly AI, an operations action planner.",
    "Return ONLY strict JSON and no Markdown fences.",
    "JSON schema:",
    '{"summary":"string","actions":[{"actionType":"monitor_tuning|notification_routing|sentry_grouping_update|incident_runbook_update|github_autofix|run_sql|shell_command","riskTier":"low|medium|high|critical","title":"string","description":"string","rationale":"string","payload":{},"rollback":{"strategy":"string","payload":{}}}]}',
    "Do not include actions blocked by policy unless no alternative exists; if included, still provide best payload and rationale.",
    "Prefer low-risk, reversible actions.",
  ].join(" ");

  const user = [
    "Generate an action plan from the following trigger, snapshot, and policy.",
    "Trigger JSON:",
    JSON.stringify(input.trigger),
    "Policy JSON:",
    JSON.stringify(input.policy),
    "Snapshot JSON:",
    JSON.stringify(input.snapshot),
    customBlock,
  ].filter(Boolean);

  return [
    { role: "system", content: system },
    { role: "user", content: user.join("\n\n") },
  ];
}
