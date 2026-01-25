import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { listMonitorsFn } from "@/server/functions/monitors";
import {
  listChannelsFn,
  createChannelFn,
  deleteChannelFn,
} from "@/server/functions/notification-channels";
import {
  listPoliciesFn,
  createPolicyFn,
  deletePolicyFn,
} from "@/server/functions/notification-policies";

type Monitor = {
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

type Policy = {
  id: string;
  monitorId: string;
  monitorName: string;
  channelId: string;
  channelType: string;
  channelConfig: string;
  thresholdFailures: number;
  notifyOnRecovery: number;
  createdAt: string;
};

export const Route = createFileRoute("/app/notifications")({
  component: Notifications,
  loader: async () => {
    const [channelsRes, policiesRes, monitorsRes] = await Promise.all([
      listChannelsFn(),
      listPoliciesFn(),
      listMonitorsFn(),
    ]);
    return {
      channels: channelsRes.channels,
      policies: policiesRes.policies,
      monitors: monitorsRes.monitors,
    };
  },
});

export default function Notifications() {
  const {
    channels: initialChannels,
    policies: initialPolicies,
    monitors: initialMonitors,
  } = Route.useLoaderData();
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [monitors] = useState<Monitor[]>(initialMonitors);
  const [error, setError] = useState<string | null>(null);

  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);

  const [channelType, setChannelType] = useState("webhook");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");

  const [monitorId, setMonitorId] = useState(initialMonitors?.[0]?.id || "");
  const [channelId, setChannelId] = useState(initialChannels?.[0]?.id || "");
  const [threshold, setThreshold] = useState("3");
  const [notifyOnRecovery, setNotifyOnRecovery] = useState(true);

  const createChannel = useServerFn(createChannelFn);
  const deleteChannel = useServerFn(deleteChannelFn);
  const listChannels = useServerFn(listChannelsFn);

  const createPolicy = useServerFn(createPolicyFn);
  const deletePolicy = useServerFn(deletePolicyFn);
  const listPolicies = useServerFn(listPoliciesFn);

  const onCreateChannel = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (channelType === "webhook") {
        await createChannel({
          data: {
            type: "webhook",
            url,
            label,
            enabled: 1,
          },
        });
      } else {
        await createChannel({
          data: {
            type: "email",
            to: emailTo,
            from: emailFrom || undefined,
            subject: emailSubject || undefined,
            label,
            enabled: 1,
          },
        });
      }
      const res = await listChannels();
      const nextChannels = res.channels;
      setChannels(nextChannels);
      if (!channelId && nextChannels.length) {
        setChannelId(nextChannels[0].id);
      }
      setUrl("");
      setLabel("");
      setEmailTo("");
      setEmailFrom("");
      setEmailSubject("");
      setChannelType("webhook");
      setIsChannelModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onCreatePolicy = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createPolicy({
        data: {
          monitor_id: monitorId,
          channel_id: channelId,
          threshold_failures: Number(threshold),
          notify_on_recovery: notifyOnRecovery ? 1 : 0,
        },
      });
      const res = await listPolicies();
      setPolicies(res.policies);
      setThreshold("3");
      setNotifyOnRecovery(true);
      setIsPolicyModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDeleteChannel = async (id: string) => {
    setError(null);
    try {
      await deleteChannel({ data: { id } });
      setChannels((prev) => prev.filter((c) => c.id !== id));
      setPolicies((prev) => prev.filter((p) => p.channelId !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDeletePolicy = async (id: string) => {
    setError(null);
    try {
      await deletePolicy({ data: { id } });
      setPolicies((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const getChannelDisplay = (channel: Channel) => {
    const config = JSON.parse(channel.configJson);
    if (channel.type === "email") {
      return {
        title: config.label || "Email channel",
        subtitle: config.to,
      };
    }
    return {
      title: config.label || "Webhook channel",
      subtitle: config.url,
    };
  };

  return (
    <div className="page">
      <div className="page-header mb-6">
        <div>
          <h2>Notifications</h2>
          <p>Route incidents to webhooks or email.</p>
        </div>
        <div className="button-row">
          <button onClick={() => setIsChannelModalOpen(true)}>
            Add Channel
          </button>
          <button onClick={() => setIsPolicyModalOpen(true)}>Add Policy</button>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="grid two">
        <div className="card">
          <div className="card-title">Channels</div>
          <div className="list">
            {channels.length ? (
              channels.map((channel) => {
                const display = getChannelDisplay(channel);
                return (
                  <div key={channel.id} className="list-row">
                    <div>
                      <div className="list-title">
                        <span className="pill small">{channel.type}</span>{" "}
                        {display.title}
                      </div>
                      <div className="muted">{display.subtitle}</div>
                    </div>
                    <button
                      type="button"
                      className="outline"
                      onClick={() => onDeleteChannel(channel.id)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="muted">No notification channels yet.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Policies</div>
          <div className="list">
            {policies.length ? (
              policies.map((policy) => {
                const config = JSON.parse(policy.channelConfig);
                const channelLabel =
                  config.label || config.url || config.to || "Channel";
                return (
                  <div key={policy.id} className="list-row">
                    <div>
                      <div className="list-title">{policy.monitorName}</div>
                      <div className="muted">
                        [{policy.channelType}] {channelLabel} ·{" "}
                        {policy.thresholdFailures} fails
                        {policy.notifyOnRecovery ? " · recovery" : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="outline"
                      onClick={() => onDeletePolicy(policy.id)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="muted">No notification policies yet.</div>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={isChannelModalOpen}
        onClose={() => setIsChannelModalOpen(false)}
        title="Create Notification Channel"
      >
        <form className="form" onSubmit={onCreateChannel}>
          <label htmlFor="channel-type">Channel type</label>
          <select
            id="channel-type"
            value={channelType}
            onChange={(event) => setChannelType(event.target.value)}
          >
            <option value="webhook">Webhook</option>
            <option value="email">Email</option>
          </select>

          <label htmlFor="channel-label">Label (optional)</label>
          <input
            id="channel-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Primary incident channel"
          />

          {channelType === "webhook" ? (
            <>
              <label htmlFor="webhook-url">Webhook URL</label>
              <input
                id="webhook-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/webhook"
                required
              />
            </>
          ) : (
            <>
              <label htmlFor="email-to">To address</label>
              <input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={(event) => setEmailTo(event.target.value)}
                placeholder="alerts@example.com"
                required
              />
              <label htmlFor="email-from">From address (optional)</label>
              <input
                id="email-from"
                type="email"
                value={emailFrom}
                onChange={(event) => setEmailFrom(event.target.value)}
                placeholder="noreply@bitwobbly.com"
              />
              <label htmlFor="email-subject">Subject prefix (optional)</label>
              <input
                id="email-subject"
                value={emailSubject}
                onChange={(event) => setEmailSubject(event.target.value)}
                placeholder="[Alert]"
              />
            </>
          )}

          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="submit">Save Channel</button>
            <button
              type="button"
              className="outline"
              onClick={() => setIsChannelModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        title="Create Notification Policy"
      >
        <form className="form" onSubmit={onCreatePolicy}>
          <label htmlFor="policy-monitor">Monitor</label>
          <select
            id="policy-monitor"
            value={monitorId}
            onChange={(event) => setMonitorId(event.target.value)}
            required
          >
            <option value="">Select monitor</option>
            {monitors.map((monitor) => (
              <option key={monitor.id} value={monitor.id}>
                {monitor.name}
              </option>
            ))}
          </select>
          <label htmlFor="policy-channel">Channel</label>
          <select
            id="policy-channel"
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            required
          >
            <option value="">Select channel</option>
            {channels.map((channel) => {
              const display = getChannelDisplay(channel);
              return (
                <option key={channel.id} value={channel.id}>
                  [{channel.type}] {display.title}
                </option>
              );
            })}
          </select>
          <label htmlFor="policy-threshold">Failure threshold</label>
          <input
            id="policy-threshold"
            type="number"
            min="1"
            max="10"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={notifyOnRecovery}
              onChange={(event) => setNotifyOnRecovery(event.target.checked)}
            />
            Notify on recovery
          </label>
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="submit">Save Policy</button>
            <button
              type="button"
              className="outline"
              onClick={() => setIsPolicyModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
