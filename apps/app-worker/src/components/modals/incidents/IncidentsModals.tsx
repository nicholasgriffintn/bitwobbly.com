import type { ComponentProps } from "react";

import { CreateIncidentModal } from "./CreateIncidentModal";
import { UpdateIncidentModal } from "./UpdateIncidentModal";

interface IncidentsModalsProps {
  isCreateOpen: boolean;
  onCloseCreate: () => void;
  isUpdateOpen: boolean;
  onCloseUpdate: () => void;
  updatingIncident: ComponentProps<typeof UpdateIncidentModal>["incident"];
  onSuccess: () => Promise<void>;
  statusPages: ComponentProps<typeof CreateIncidentModal>["statusPages"];
  components: ComponentProps<typeof CreateIncidentModal>["components"];
}

export function IncidentsModals({
  isCreateOpen,
  onCloseCreate,
  isUpdateOpen,
  onCloseUpdate,
  updatingIncident,
  onSuccess,
  statusPages,
  components,
}: IncidentsModalsProps) {
  return (
    <>
      <CreateIncidentModal
        isOpen={isCreateOpen}
        onClose={onCloseCreate}
        onSuccess={onSuccess}
        statusPages={statusPages}
        components={components}
      />
      <UpdateIncidentModal
        isOpen={isUpdateOpen}
        onClose={onCloseUpdate}
        onSuccess={onSuccess}
        incident={updatingIncident}
      />
    </>
  );
}
