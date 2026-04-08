import { createFileRoute } from "@tanstack/react-router";

import { AiAuditPage } from "@/components/assistant/AiAuditPage";
import { getAiAssistantSettingsFn } from "@/server/functions/ai-assistant";
import { listAiActionRunsFn } from "@/server/functions/ai-actions";

export const Route = createFileRoute("/app/ai-audit")({
  component: AiAuditRoute,
  loader: async () => {
    const [assistantResponse, actionRunsResponse] = await Promise.all([
      getAiAssistantSettingsFn(),
      listAiActionRunsFn({ data: { limit: 30 } }),
    ]);

    return {
      settings: assistantResponse.settings,
      latestRuns: assistantResponse.latestRuns,
      initialActionRuns: actionRunsResponse,
    };
  },
});

function AiAuditRoute() {
  const { settings, latestRuns, initialActionRuns } = Route.useLoaderData();

  return (
    <AiAuditPage
      initialSettings={settings}
      initialRuns={latestRuns}
      initialActionRuns={initialActionRuns}
    />
  );
}
