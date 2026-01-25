import { useState, type FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';

import { listMonitorsFn } from '@/server/functions/monitors';
import {
  listChannelsFn,
  createChannelFn,
  deleteChannelFn
} from '@/server/functions/notification-channels';
import {
  listPoliciesFn,
  createPolicyFn,
  deletePolicyFn
} from '@/server/functions/notification-policies';

type Monitor = {
  id: string;
  name: string;
};

type Channel = {
  id: string;
  type: 'webhook';
  config_json: string;
  enabled: number;
  created_at: string;
};

type Policy = {
  id: string;
  monitor_id: string;
  monitor_name: string;
  channel_id: string;
  channel_type: string;
  channel_config: string;
  threshold_failures: number;
  notify_on_recovery: number;
  created_at: string;
};

type ChannelConfig = {
  url: string;
  label?: string;
};

export const Route = createFileRoute('/app/notifications')({
  component: Notifications,
  loader: async () => {
    const [channelsRes, policiesRes, monitorsRes] = await Promise.all([
      listChannelsFn(),
      listPoliciesFn(),
      listMonitorsFn()
    ]);
    return {
      channels: channelsRes.channels,
      policies: policiesRes.policies,
      monitors: monitorsRes.monitors
    };
  }
});

export default function Notifications() {
  const { channels: initialChannels, policies: initialPolicies, monitors: initialMonitors } = Route.useLoaderData();
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [monitors, setMonitors] = useState<Monitor[]>(initialMonitors);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [monitorId, setMonitorId] = useState(initialMonitors?.[0]?.id || '');
  const [channelId, setChannelId] = useState(initialChannels?.[0]?.id || '');
  const [threshold, setThreshold] = useState('3');
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
      await createChannel({
        data: {
          type: 'webhook',
          url,
          label,
          enabled: 1
        }
      });
      const res = await listChannels();
      const nextChannels = res.channels;
      setChannels(nextChannels);
      if (!channelId && nextChannels.length) {
        setChannelId(nextChannels[0].id);
      }
      setUrl('');
      setLabel('');
    } catch (err) {
      setError(err.message);
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
        }
      });
      const res = await listPolicies();
      setPolicies(res.policies);
    } catch (err) {
      setError(err.message);
    }
  };

  const onDeleteChannel = async (id: string) => {
    setError(null);
    try {
      await deleteChannel({ data: { id } });
      setChannels((prev) => prev.filter((c) => c.id !== id));
      setPolicies((prev) => prev.filter((p) => p.channel_id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const onDeletePolicy = async (id: string) => {
    setError(null);
    try {
      await deletePolicy({ data: { id } });
      setPolicies((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Notifications</h2>
          <p>Route incidents to webhooks while we build more channels.</p>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="grid two">
        <div className="card">
          <div className="card-title">Create webhook channel</div>
          <form className="form" onSubmit={onCreateChannel}>
            <label htmlFor="webhook-label">Label (optional)</label>
            <input
              id="webhook-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Primary incident webhook"
            />
            <label htmlFor="webhook-url">Webhook URL</label>
            <input
              id="webhook-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/webhook"
              required
            />
            <button type="submit">Save channel</button>
          </form>
        </div>

        <div className="card">
          <div className="card-title">Create policy</div>
          <form className="form" onSubmit={onCreatePolicy}>
            <label htmlFor="policy-monitor">Monitor</label>
            <select
              id="policy-monitor"
              value={monitorId}
              onChange={(event) => setMonitorId(event.target.value)}
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
            >
              <option value="">Select channel</option>
              {channels.map((channel) => {
                const config = JSON.parse(channel.config_json);
                return (
                  <option key={channel.id} value={channel.id}>
                    {config.label || config.url}
                  </option>
                );
              })}
            </select>
            <label htmlFor="policy-threshold">Failure threshold</label>
            <input
              id="policy-threshold"
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
            <button type="submit">Save policy</button>
          </form>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-title">Webhook channels</div>
          <div className="list">
            {channels.length ? (
              channels.map((channel) => {
                const config = JSON.parse(channel.config_json);
                return (
                  <div key={channel.id} className="list-row">
                    <div>
                      <div className="list-title">
                        {config.label || 'Webhook channel'}
                      </div>
                      <div className="muted">{config.url}</div>
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
              <div className="muted">No webhook channels yet.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Policies</div>
          <div className="list">
            {policies.length ? (
              policies.map((policy) => {
                const config = JSON.parse(
                  policy.channel_config,
                );
                return (
                  <div key={policy.id} className="list-row">
                    <div>
                      <div className="list-title">{policy.monitor_name}</div>
                      <div className="muted">
                        {config.label || config.url} ·{' '}
                        {policy.threshold_failures} fails
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
    </div>
  );
}
