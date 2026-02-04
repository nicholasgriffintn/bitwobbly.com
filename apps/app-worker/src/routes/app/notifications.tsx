import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardTitle, Page, PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { TabNav } from "@/components/navigation";
import { ListContainer, ListRow } from "@/components/list";
import { NotificationsModals } from "@/components/modals/notifications";
import { Button } from "@/components/ui";
import { toTitleCase } from "@/utils/format";
import { listMonitorsFn } from "@/server/functions/monitors";
import { listSentryProjectsFn } from "@/server/functions/sentry";
import {
  listChannelsFn,
  deleteChannelFn,
} from "@/server/functions/notification-channels";

import {
  listAlertRulesFn,
  deleteAlertRuleFn,
  toggleAlertRuleFn,
} from "@/server/functions/alert-rules";

type Monitor = {
  id: string;
  name: string;
};

type Project = {
  id: string;
  name: string;
};

type Channel = {
  id: string;
  type: string;
  configJson: string;
  enabled: number;
  createdAt: string;
};

type AlertRule = {
  id: string;
  name: string;
  enabled: number;
  sourceType: string;
  projectId: string | null;
  monitorId: string | null;
  environment: string | null;
  triggerType: string;
  conditionsJson: string | null;
  thresholdJson: string | null;
  channelId: string;
  actionIntervalSeconds: number;
  lastTriggeredAt: number | null;
  ownerId: string | null;
  createdAt: string;
  channelType: string;
  channelConfig: string;
  monitorName: string | null;
};

type Tab = "channels" | "rules";

const TRIGGER_TYPES = [
  { value: "new_issue", label: "New Issue" },
  { value: "issue_regression", label: "Issue Regression" },
  { value: "event_threshold", label: "Event Threshold" },
  { value: "user_threshold", label: "User Threshold" },
  { value: "status_change", label: "Status Change" },
  { value: "high_priority", label: "High Priority" },
  { value: "monitor_down", label: "Monitor Down" },
  { value: "monitor_recovery", label: "Monitor Recovery" },
];

export const Route = createFileRoute("/app/notifications")({
  component: Notifications,
  loader: async () => {
    const [channelsRes, monitorsRes, projectsRes, rulesRes] = await Promise.all(
      [
        listChannelsFn(),
        listMonitorsFn(),
        listSentryProjectsFn(),
        listAlertRulesFn(),
      ]
    );
    return {
      channels: channelsRes.channels,
      monitors: monitorsRes.monitors,
      projects: projectsRes.projects,
      rules: rulesRes.rules,
    };
  },
});

export default function Notifications() {
  const {
    channels: initialChannels,
    monitors: initialMonitors,
    projects: initialProjects,
    rules: initialRules,
  } = Route.useLoaderData();

  const [activeTab, setActiveTab] = useState<Tab>("channels");
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [monitors] = useState<Monitor[]>(initialMonitors);
  const [projects] = useState<Project[]>(initialProjects);
  const [rules, setRules] = useState<AlertRule[]>(initialRules);
  const [error, setError] = useState<string | null>(null);

  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const deleteChannel = useServerFn(deleteChannelFn);
  const listChannels = useServerFn(listChannelsFn);

  const deleteRule = useServerFn(deleteAlertRuleFn);
  const toggleRule = useServerFn(toggleAlertRuleFn);
  const listRules = useServerFn(listAlertRulesFn);

  const refreshChannels = async () => {
    try {
      const res = await listChannels();
      setChannels(res.channels);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const refreshRules = async () => {
    try {
      const res = await listRules();
      setRules(res.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDeleteChannel = async (id: string) => {
    setError(null);
    try {
      await deleteChannel({ data: { id } });
      setChannels((prev) => prev.filter((c) => c.id !== id));
      setRules((prev) => prev.filter((r) => r.channelId !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDeleteRule = async (id: string) => {
    setError(null);
    try {
      await deleteRule({ data: { id } });
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onToggleRule = async (id: string, enabled: boolean) => {
    setError(null);
    try {
      await toggleRule({ data: { id, enabled } });
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled: enabled ? 1 : 0 } : r))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const getChannelDisplay = (channel: Channel) => {
    const config = JSON.parse(channel.configJson);
    if (channel.type === "email") {
      return { title: config.label || "Email channel", subtitle: config.to };
    }
    return { title: config.label || "Webhook channel", subtitle: config.url };
  };

  const getTriggerLabel = (type: string) => {
    return TRIGGER_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "All projects";
    return projects.find((p) => p.id === projectId)?.name || projectId;
  };

  const formatLastTriggered = (ts: number | null) => {
    if (!ts) return "Never";
    const date = new Date(ts * 1000);
    return date.toLocaleString();
  };

  return (
    <Page className="page-stack">
      <PageHeader
        title="Notifications"
        description="Route incidents and issues to webhooks or email."
      >
        <div className="button-row">
          {activeTab === "channels" && (
            <button onClick={() => setIsChannelModalOpen(true)}>
              Add Channel
            </button>
          )}
          {activeTab === "rules" && (
            <button
              onClick={() => {
                setEditingRule(null);
                setIsRuleModalOpen(true);
              }}
            >
              Add Alert Rule
            </button>
          )}
        </div>
      </PageHeader>

      {error && <ErrorCard message={error} />}

      <TabNav
        tabs={[
          { id: "channels", label: "Channels", count: channels.length },
          { id: "rules", label: "Rules", count: rules.length },
        ]}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as Tab)}
      />

      {activeTab === "channels" && (
        <Card>
          <CardTitle>Notification Channels</CardTitle>
          <ListContainer
            isEmpty={!channels.length}
            emptyMessage="No notification channels yet."
          >
            {channels.map((channel) => {
              const display = getChannelDisplay(channel);
              return (
                <ListRow
                  key={channel.id}
                  titleClassName="flex flex-wrap items-center gap-2"
                  title={
                    <>
                      <span className="pill small">
                        {toTitleCase(channel.type)}
                      </span>
                      <span>{display.title}</span>
                    </>
                  }
                  subtitle={display.subtitle}
                  actions={
                    <Button
                      type="button"
                      variant="outline"
                      color="danger"
                      onClick={() => onDeleteChannel(channel.id)}
                    >
                      Remove
                    </Button>
                  }
                />
              );
            })}
          </ListContainer>
        </Card>
      )}

      {activeTab === "rules" && (
        <Card>
          <CardTitle>Issue Alert Rules</CardTitle>
          <p className="muted mb-4">
            Alert rules trigger notifications based on issue events, thresholds,
            and conditions.
          </p>
          <ListContainer
            isEmpty={!rules.length}
            emptyMessage="No alert rules yet."
          >
            {rules.map((rule) => {
              const config = JSON.parse(rule.channelConfig);
              const channelLabel =
                config.label || config.url || config.to || "Channel";
              return (
                <ListRow
                  key={rule.id}
                  title={
                    <>
                      <span
                        className={`pill small ${rule.enabled ? "success" : "muted"}`}
                      >
                        {rule.enabled ? "Active" : "Disabled"}
                      </span>{" "}
                      {rule.name}
                    </>
                  }
                  subtitle={
                    <>
                      <div>
                        <span className="pill small">
                          {getTriggerLabel(rule.triggerType)}
                        </span>{" "}
                        ·{" "}
                        {rule.sourceType === "monitor"
                          ? `Monitor: ${rule.monitorName || "Unknown"}`
                          : `${getProjectName(rule.projectId)}${
                              rule.environment ? ` (${rule.environment})` : ""
                            }`}{" "}
                        · [{toTitleCase(rule.channelType)}] {channelLabel}
                      </div>
                      <div className="text-[0.8rem]">
                        Last triggered:{" "}
                        {formatLastTriggered(rule.lastTriggeredAt)}
                      </div>
                    </>
                  }
                  actions={
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingRule(rule);
                          setIsRuleModalOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        color={rule.enabled ? "warning" : "success"}
                        onClick={() => onToggleRule(rule.id, !rule.enabled)}
                      >
                        {rule.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        color="danger"
                        onClick={() => onDeleteRule(rule.id)}
                      >
                        Delete
                      </Button>
                    </>
                  }
                />
              );
            })}
          </ListContainer>
        </Card>
      )}

      <NotificationsModals
        isChannelOpen={isChannelModalOpen}
        onCloseChannel={() => setIsChannelModalOpen(false)}
        onChannelsSuccess={refreshChannels}
        isRuleOpen={isRuleModalOpen}
        onCloseRule={() => {
          setIsRuleModalOpen(false);
          setEditingRule(null);
        }}
        onRulesSuccess={refreshRules}
        editingRule={editingRule}
        monitors={monitors}
        projects={projects}
        channels={channels}
      />
    </Page>
  );
}
