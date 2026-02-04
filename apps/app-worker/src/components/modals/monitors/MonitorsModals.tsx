import type { ComponentProps } from "react";

import { CreateMonitorModal } from "./CreateMonitorModal";
import { EditMonitorModal } from "./EditMonitorModal";
import { ManualStatusModal } from "./ManualStatusModal";
import { MonitorGroupsModal } from "../monitor-groups";

interface MonitorsModalsProps {
  isCreateOpen: boolean;
  onCloseCreate: () => void;
  isEditOpen: boolean;
  onCloseEdit: () => void;
  editingMonitor: ComponentProps<typeof EditMonitorModal>["monitor"];
  isManualStatusOpen: boolean;
  onCloseManualStatus: () => void;
  manualStatusMonitorId: ComponentProps<typeof ManualStatusModal>["monitorId"];
  groups: Array<{ id: string; name: string; description: string | null }>;
  isGroupsOpen: boolean;
  onCloseGroups: () => void;
  onSuccess: () => Promise<void>;
}

export function MonitorsModals({
  isCreateOpen,
  onCloseCreate,
  isEditOpen,
  onCloseEdit,
  editingMonitor,
  isManualStatusOpen,
  onCloseManualStatus,
  manualStatusMonitorId,
  groups,
  isGroupsOpen,
  onCloseGroups,
  onSuccess,
}: MonitorsModalsProps) {
  return (
    <>
      <CreateMonitorModal
        isOpen={isCreateOpen}
        onClose={onCloseCreate}
        onSuccess={onSuccess}
        groups={groups}
      />
      <EditMonitorModal
        isOpen={isEditOpen}
        onClose={onCloseEdit}
        onSuccess={onSuccess}
        monitor={editingMonitor}
        groups={groups}
      />
      <MonitorGroupsModal
        isOpen={isGroupsOpen}
        onClose={onCloseGroups}
        groups={groups}
        onSuccess={onSuccess}
      />
      <ManualStatusModal
        isOpen={isManualStatusOpen}
        onClose={onCloseManualStatus}
        onSuccess={onSuccess}
        monitorId={manualStatusMonitorId}
      />
    </>
  );
}
