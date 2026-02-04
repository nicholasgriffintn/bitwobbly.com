import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardTitle, Page, PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { ListContainer, ListRow } from "@/components/list";
import { Button, Badge } from "@/components/ui";
import { CreateSuppressionModal } from "@/components/modals/maintenance";

import { listMonitorsFn } from "@/server/functions/monitors";
import { listMonitorGroupsFn } from "@/server/functions/monitor-groups";
import { listComponentsFn } from "@/server/functions/components";
import {
  listSuppressionsFn,
  deleteSuppressionFn,
} from "@/server/functions/suppressions";

type Monitor = { id: string; name: string };
type MonitorGroup = { id: string; name: string };
type Component = { id: string; name: string };

type Suppression = {
  id: string;
  kind: string;
  name: string;
  reason: string | null;
  startsAt: number;
  endsAt: number | null;
  scopes: Array<{ scopeType: string; scopeId: string }>;
};

export const Route = createFileRoute("/app/maintenance")({
  component: Maintenance,
  loader: async () => {
    const [suppRes, monitorsRes, groupsRes, componentsRes] = await Promise.all([
      listSuppressionsFn(),
      listMonitorsFn(),
      listMonitorGroupsFn(),
      listComponentsFn(),
    ]);
    return {
      suppressions: suppRes.suppressions,
      monitors: monitorsRes.monitors,
      groups: groupsRes.groups,
      components: componentsRes.components,
    };
  },
});

function Maintenance() {
  const data = Route.useLoaderData();
  const [suppressions, setSuppressions] = useState<Suppression[]>(
    data.suppressions
  );
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const listSuppressions = useServerFn(listSuppressionsFn);
  const deleteSuppression = useServerFn(deleteSuppressionFn);

  const monitorById = useMemo(() => {
    return new Map<string, string>(
      (data.monitors as Monitor[]).map((m) => [m.id, m.name])
    );
  }, [data.monitors]);

  const groupById = useMemo(() => {
    return new Map<string, string>(
      (data.groups as MonitorGroup[]).map((g) => [g.id, g.name])
    );
  }, [data.groups]);

  const componentById = useMemo(() => {
    return new Map<string, string>(
      (data.components as Component[]).map((c) => [c.id, c.name])
    );
  }, [data.components]);

  const refresh = async () => {
    try {
      const res = await listSuppressions();
      setSuppressions(res.suppressions as Suppression[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const formatSec = (sec: number) => {
    return (
      new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
    );
  };

  const resolveScopeLabel = (type: string, id: string) => {
    if (type === "monitor") return monitorById.get(id) || id;
    if (type === "monitor_group") return groupById.get(id) || id;
    if (type === "component") return componentById.get(id) || id;
    return id;
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteSuppression({ data: { id } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Page className="page-stack">
      <PageHeader
        title="Maintenance and silences"
        description="Schedule maintenance windows and suppress monitor alert noise with scoped silences."
      >
        <button type="button" onClick={() => setIsCreateOpen(true)}>
          Create
        </button>
      </PageHeader>

      {error ? <ErrorCard message={error} /> : null}

      <Card>
        <CardTitle>Active and scheduled</CardTitle>
        <ListContainer
          isEmpty={!suppressions.length}
          emptyMessage="No maintenance windows or silences yet."
        >
          {suppressions.map((s) => {
            const scope = s.scopes[0];
            return (
              <ListRow
                key={s.id}
                title={
                  <>
                    {s.name}{" "}
                    <Badge size="small" variant="muted">
                      {s.kind === "silence" ? "Silence" : "Maintenance"}
                    </Badge>
                  </>
                }
                subtitle={
                  <>
                    {scope
                      ? `${scope.scopeType}: ${resolveScopeLabel(
                          scope.scopeType,
                          scope.scopeId
                        )}`
                      : "No scope"}
                    {" · "}
                    {formatSec(s.startsAt)}
                    {" → "}
                    {s.endsAt ? formatSec(s.endsAt) : "no end"}
                    {s.reason ? ` · ${s.reason}` : ""}
                  </>
                }
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    color="danger"
                    onClick={() => onDelete(s.id)}
                  >
                    Delete
                  </Button>
                }
              />
            );
          })}
        </ListContainer>
      </Card>

      <CreateSuppressionModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        monitors={data.monitors as Monitor[]}
        groups={data.groups as MonitorGroup[]}
        components={data.components as Component[]}
        onSuccess={refresh}
      />
    </Page>
  );
}
