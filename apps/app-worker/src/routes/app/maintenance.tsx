import { Suspense, useEffect, useMemo, useState } from "react";
import { Await, createFileRoute, defer } from "@tanstack/react-router";
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

type Component = { id: string; name: string };
type Monitor = { id: string; name: string };
type MonitorGroup = { id: string; name: string };

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
    const suppressionsPromise = listSuppressionsFn().then((r) => r.suppressions);
    const scopeDataPromise = Promise.all([
      listMonitorsFn(),
      listMonitorGroupsFn(),
    ]).then(([monitorsRes, groupsRes]) => ({
      monitors: monitorsRes.monitors,
      groups: groupsRes.groups,
    }));
    const componentsPromise = listComponentsFn().then((r) => r.components);
    const suppressions = await suppressionsPromise;
    return {
      suppressions,
      scopeDataPromise: defer(scopeDataPromise),
      componentsPromise: defer(componentsPromise),
    };
  },
});

function ScopeDataHydrator({
  monitors,
  groups,
  onLoaded,
}: {
  monitors: Monitor[];
  groups: MonitorGroup[];
  onLoaded: (data: { monitors: Monitor[]; groups: MonitorGroup[] }) => void;
}) {
  useEffect(() => {
    onLoaded({ monitors, groups });
  }, [groups, monitors, onLoaded]);
  return null;
}

function ComponentsHydrator({
  components,
  onLoaded,
}: {
  components: Component[];
  onLoaded: (components: Component[]) => void;
}) {
  useEffect(() => {
    onLoaded(components);
  }, [components, onLoaded]);
  return null;
}

function Maintenance() {
  const data = Route.useLoaderData();
  const [suppressions, setSuppressions] = useState<Suppression[]>(
    data.suppressions
  );
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [groups, setGroups] = useState<MonitorGroup[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [isScopeDataLoaded, setIsScopeDataLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const listSuppressions = useServerFn(listSuppressionsFn);
  const deleteSuppression = useServerFn(deleteSuppressionFn);

  const monitorById = useMemo(() => {
    return new Map<string, string>(monitors.map((m) => [m.id, m.name]));
  }, [monitors]);

  const groupById = useMemo(() => {
    return new Map<string, string>(groups.map((g) => [g.id, g.name]));
  }, [groups]);

  const componentById = useMemo(() => {
    return new Map<string, string>(components.map((c) => [c.id, c.name]));
  }, [components]);

  const refresh = async () => {
    try {
      const res = await listSuppressions();
      setSuppressions(res.suppressions);
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

  const openCreateModal = () => {
    if (!isScopeDataLoaded) {
      setError("Monitor and group options are still loading.");
      return;
    }
    setError(null);
    setIsCreateOpen(true);
  };

  return (
    <Page className="page-stack">
      <PageHeader
        title="Maintenance and silences"
        description="Schedule maintenance windows and suppress monitor alert noise with scoped silences."
      >
        <button type="button" onClick={openCreateModal}>
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
          {suppressions.map((s, index) => {
            const scope = s.scopes[0];
            return (
              <ListRow
                 isOdd={index > 0}
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
        monitors={monitors}
        groups={groups}
        components={components}
        onSuccess={refresh}
      />

      <Suspense fallback={null}>
        <Await promise={data.scopeDataPromise}>
          {(loaded: { monitors: Monitor[]; groups: MonitorGroup[] }) => (
            <ScopeDataHydrator
              monitors={loaded.monitors}
              groups={loaded.groups}
              onLoaded={({ monitors, groups }) => {
                setMonitors(monitors);
                setGroups(groups);
                setIsScopeDataLoaded(true);
              }}
            />
          )}
        </Await>
      </Suspense>

      <Suspense fallback={null}>
        <Await promise={data.componentsPromise}>
          {(loaded: Component[]) => (
            <ComponentsHydrator components={loaded} onLoaded={setComponents} />
          )}
        </Await>
      </Suspense>
    </Page>
  );
}
