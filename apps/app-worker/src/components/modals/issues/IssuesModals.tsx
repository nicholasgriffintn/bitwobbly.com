import type { ComponentProps } from "react";

import { CreateProjectModal } from "./CreateProjectModal";
import { DeleteProjectModal } from "./DeleteProjectModal";
import { EditProjectModal } from "./EditProjectModal";
import { ProjectDsnModal } from "./ProjectDsnModal";

interface IssuesModalsProps {
  isCreateOpen: boolean;
  onCloseCreate: () => void;
  onCreateSuccess: () => Promise<void>;
  onCreated: ComponentProps<typeof CreateProjectModal>["onCreated"];
  components: ComponentProps<typeof CreateProjectModal>["components"];
  isEditOpen: boolean;
  onCloseEdit: () => void;
  onEditSuccess: () => Promise<void>;
  editingProject: ComponentProps<typeof EditProjectModal>["project"];
  isDsnOpen: boolean;
  onCloseDsn: () => void;
  dsn: ComponentProps<typeof ProjectDsnModal>["dsn"];
  publicKey: ComponentProps<typeof ProjectDsnModal>["publicKey"];
  secretKey: ComponentProps<typeof ProjectDsnModal>["secretKey"];
  otlpTracesEndpoint: ComponentProps<typeof ProjectDsnModal>["otlpTracesEndpoint"];
  otlpLogsEndpoint: ComponentProps<typeof ProjectDsnModal>["otlpLogsEndpoint"];
  otlpAuthHeader: ComponentProps<typeof ProjectDsnModal>["otlpAuthHeader"];
  isDeleteOpen: boolean;
  onCloseDelete: () => void;
  onDeleteSuccess: () => Promise<void>;
  deletingProjectId: ComponentProps<typeof DeleteProjectModal>["projectId"];
}

export function IssuesModals({
  isCreateOpen,
  onCloseCreate,
  onCreateSuccess,
  onCreated,
  components,
  isEditOpen,
  onCloseEdit,
  onEditSuccess,
  editingProject,
  isDsnOpen,
  onCloseDsn,
  dsn,
  publicKey,
  secretKey,
  otlpTracesEndpoint,
  otlpLogsEndpoint,
  otlpAuthHeader,
  isDeleteOpen,
  onCloseDelete,
  onDeleteSuccess,
  deletingProjectId,
}: IssuesModalsProps) {
  return (
    <>
      <CreateProjectModal
        isOpen={isCreateOpen}
        onClose={onCloseCreate}
        onSuccess={onCreateSuccess}
        onCreated={onCreated}
        components={components}
      />
      <EditProjectModal
        isOpen={isEditOpen}
        onClose={onCloseEdit}
        onSuccess={onEditSuccess}
        project={editingProject}
        components={components}
      />
      <ProjectDsnModal
        isOpen={isDsnOpen}
        onClose={onCloseDsn}
        dsn={dsn}
        publicKey={publicKey}
        secretKey={secretKey}
        otlpTracesEndpoint={otlpTracesEndpoint}
        otlpLogsEndpoint={otlpLogsEndpoint}
        otlpAuthHeader={otlpAuthHeader}
      />
      <DeleteProjectModal
        isOpen={isDeleteOpen}
        onClose={onCloseDelete}
        onSuccess={onDeleteSuccess}
        projectId={deletingProjectId}
      />
    </>
  );
}
