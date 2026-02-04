import type { ComponentProps } from "react";

import { CreateMonitorModal } from "./CreateMonitorModal";
import { EditMonitorModal } from "./EditMonitorModal";
import { ManualStatusModal } from "./ManualStatusModal";

interface MonitorsModalsProps {
  isCreateOpen: boolean;
  onCloseCreate: () => void;
  isEditOpen: boolean;
  onCloseEdit: () => void;
  editingMonitor: ComponentProps<typeof EditMonitorModal>["monitor"];
  isManualStatusOpen: boolean;
  onCloseManualStatus: () => void;
  manualStatusMonitorId: ComponentProps<typeof ManualStatusModal>["monitorId"];
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
  onSuccess,
}: MonitorsModalsProps) {
  return (
    <>
      <CreateMonitorModal
        isOpen={isCreateOpen}
        onClose={onCloseCreate}
        onSuccess={onSuccess}
      />
      <EditMonitorModal
        isOpen={isEditOpen}
        onClose={onCloseEdit}
        onSuccess={onSuccess}
        monitor={editingMonitor}
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

