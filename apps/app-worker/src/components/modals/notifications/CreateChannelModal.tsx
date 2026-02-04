import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { createChannelFn } from "@/server/functions/notification-channels";

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function CreateChannelModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateChannelModalProps) {
  const [channelType, setChannelType] = useState("webhook");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createChannel = useServerFn(createChannelFn);

  const handleClose = () => {
    setUrl("");
    setLabel("");
    setEmailTo("");
    setEmailFrom("");
    setEmailSubject("");
    setChannelType("webhook");
    setError(null);
    onClose();
  };

  const onCreateChannel = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (channelType === "webhook") {
        await createChannel({
          data: { type: "webhook", url, label, enabled: 1 },
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
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Notification Channel"
    >
      <form className="form" onSubmit={onCreateChannel}>
        {error && <div className="form-error">{error}</div>}
        <label htmlFor="channel-type">Channel type</label>
        <select
          id="channel-type"
          value={channelType}
          onChange={(e) => setChannelType(e.target.value)}
        >
          <option value="webhook">Webhook</option>
          <option value="email">Email</option>
        </select>

        <label htmlFor="channel-label">Label (optional)</label>
        <input
          id="channel-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Primary incident channel"
        />

        {channelType === "webhook" ? (
          <>
            <label htmlFor="webhook-url">Webhook URL</label>
            <input
              id="webhook-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
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
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="alerts@example.com"
              required
            />
            <label htmlFor="email-from">From address (optional)</label>
            <input
              id="email-from"
              type="email"
              value={emailFrom}
              onChange={(e) => setEmailFrom(e.target.value)}
              placeholder="noreply@bitwobbly.com"
            />
            <label htmlFor="email-subject">Subject prefix (optional)</label>
            <input
              id="email-subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="[Alert]"
            />
          </>
        )}

        <FormActions>
          <button type="submit">Save Channel</button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
