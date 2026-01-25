import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { listMonitorsFn } from "@/server/functions/monitors";
import {
  listComponentsFn,
  createComponentFn,
  deleteComponentFn,
  linkMonitorFn,
  unlinkMonitorFn,
} from "@/server/functions/components";

type Monitor = {
  id: string;
  name: string;
};

type Component = {
  id: string;
  name: string;
  description: string | null;
  monitorIds: string[];
};

export const Route = createFileRoute("/app/components")({
  component: Components,
  loader: async () => {
    const [componentsRes, monitorsRes] = await Promise.all([
      listComponentsFn(),
      listMonitorsFn(),
    ]);
    return {
      components: componentsRes.components,
      monitors: monitorsRes.monitors,
    };
  },
});

export default function Components() {
  const { components: initialComponents, monitors: initialMonitors } =
    Route.useLoaderData();
  const [components, setComponents] = useState<Component[]>(initialComponents);
  const [monitors] = useState<Monitor[]>(initialMonitors);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const createComponent = useServerFn(createComponentFn);
  const deleteComponent = useServerFn(deleteComponentFn);
  const listComponents = useServerFn(listComponentsFn);
  const linkMonitor = useServerFn(linkMonitorFn);
  const unlinkMonitor = useServerFn(unlinkMonitorFn);

  const refreshComponents = async () => {
    try {
      const res = await listComponents();
      setComponents(res.components);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createComponent({
        data: { name, description: description || undefined },
      });
      await refreshComponents();
      setName("");
      setDescription("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (id: string) => {
    setError(null);
    try {
      await deleteComponent({ data: { id } });
      setComponents((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onToggleMonitor = async (
    componentId: string,
    monitorId: string,
    linked: boolean,
  ) => {
    setError(null);
    try {
      if (linked) {
        await unlinkMonitor({ data: { componentId, monitorId } });
      } else {
        await linkMonitor({ data: { componentId, monitorId } });
      }
      await refreshComponents();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Components</h2>
          <p>
            Group monitors into logical service components for status pages.
          </p>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div className="card-title">Create component</div>
        <form className="form" onSubmit={onCreate}>
          <label htmlFor="component-name">Name</label>
          <input
            id="component-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="API Gateway"
            required
          />
          <label htmlFor="component-description">Description (optional)</label>
          <input
            id="component-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Core API services"
          />
          <button type="submit">Save component</button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Components</div>
        <div className="list">
          {components.length ? (
            components.map((component) => (
              <div key={component.id} className="list-item-expanded">
                <div className="list-row">
                  <div>
                    <div className="list-title">{component.name}</div>
                    <div className="muted">
                      {component.description || "No description"}
                      {" · "}
                      {component.monitorIds.length} monitor
                      {component.monitorIds.length !== 1 ? "s" : ""} linked
                    </div>
                  </div>
                  <div className="button-row">
                    <button
                      type="button"
                      className="outline"
                      onClick={() =>
                        setExpandedId(
                          expandedId === component.id ? null : component.id,
                        )
                      }
                    >
                      {expandedId === component.id ? "Hide" : "Link"} monitors
                    </button>
                    <button
                      type="button"
                      className="outline"
                      onClick={() => onDelete(component.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {expandedId === component.id && (
                  <div className="nested-list">
                    {monitors.length ? (
                      monitors.map((monitor) => {
                        const linked = component.monitorIds.includes(
                          monitor.id,
                        );
                        return (
                          <label key={monitor.id} className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={linked}
                              onChange={() =>
                                onToggleMonitor(
                                  component.id,
                                  monitor.id,
                                  linked,
                                )
                              }
                            />
                            <span>{monitor.name}</span>
                          </label>
                        );
                      })
                    ) : (
                      <div className="muted">
                        No monitors available. Create monitors first.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="muted">No components yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
