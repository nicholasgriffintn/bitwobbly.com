import type { ComponentProps } from "react";

import { CreateStatusPageModal } from "./CreateStatusPageModal";
import { EditStatusPageModal } from "./EditStatusPageModal";

interface StatusPagesModalsProps {
  isCreateOpen: boolean;
  onCloseCreate: () => void;
  isEditOpen: boolean;
  onCloseEdit: () => void;
  editingPage: ComponentProps<typeof EditStatusPageModal>["page"];
  onSuccess: () => Promise<void>;
}

export function StatusPagesModals({
  isCreateOpen,
  onCloseCreate,
  isEditOpen,
  onCloseEdit,
  editingPage,
  onSuccess,
}: StatusPagesModalsProps) {
  return (
    <>
      <CreateStatusPageModal
        isOpen={isCreateOpen}
        onClose={onCloseCreate}
        onSuccess={onSuccess}
      />
      <EditStatusPageModal
        isOpen={isEditOpen}
        onClose={onCloseEdit}
        onSuccess={onSuccess}
        page={editingPage}
      />
    </>
  );
}
