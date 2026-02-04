import type { ComponentProps } from "react";

import { CreateComponentModal } from "./CreateComponentModal";
import { EditComponentModal } from "./EditComponentModal";

interface ComponentsModalsProps {
  isCreateOpen: boolean;
  onCloseCreate: () => void;
  isEditOpen: boolean;
  onCloseEdit: () => void;
  editingComponent: ComponentProps<typeof EditComponentModal>["component"];
  onSuccess: () => Promise<void>;
}

export function ComponentsModals({
  isCreateOpen,
  onCloseCreate,
  isEditOpen,
  onCloseEdit,
  editingComponent,
  onSuccess,
}: ComponentsModalsProps) {
  return (
    <>
      <CreateComponentModal
        isOpen={isCreateOpen}
        onClose={onCloseCreate}
        onSuccess={onSuccess}
      />
      <EditComponentModal
        isOpen={isEditOpen}
        onClose={onCloseEdit}
        onSuccess={onSuccess}
        component={editingComponent}
      />
    </>
  );
}
