import type { ComponentProps } from "react";

import { AlertRuleModal } from "./AlertRuleModal";
import { CreateChannelModal } from "./CreateChannelModal";

interface NotificationsModalsProps {
  isChannelOpen: boolean;
  onCloseChannel: () => void;
  onChannelsSuccess: () => Promise<void>;
  isRuleOpen: boolean;
  onCloseRule: () => void;
  onRulesSuccess: () => Promise<void>;
  editingRule: ComponentProps<typeof AlertRuleModal>["editingRule"];
  monitors: ComponentProps<typeof AlertRuleModal>["monitors"];
  projects: ComponentProps<typeof AlertRuleModal>["projects"];
  channels: ComponentProps<typeof AlertRuleModal>["channels"];
}

export function NotificationsModals({
  isChannelOpen,
  onCloseChannel,
  onChannelsSuccess,
  isRuleOpen,
  onCloseRule,
  onRulesSuccess,
  editingRule,
  monitors,
  projects,
  channels,
}: NotificationsModalsProps) {
  return (
    <>
      <CreateChannelModal
        isOpen={isChannelOpen}
        onClose={onCloseChannel}
        onSuccess={onChannelsSuccess}
      />
      <AlertRuleModal
        isOpen={isRuleOpen}
        onClose={onCloseRule}
        onSuccess={onRulesSuccess}
        editingRule={editingRule}
        monitors={monitors}
        projects={projects}
        channels={channels}
      />
    </>
  );
}

