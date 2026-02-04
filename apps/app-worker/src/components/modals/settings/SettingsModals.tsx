import type { ComponentProps } from "react";

import { CreateInviteModal } from "./CreateInviteModal";
import { CreateTeamModal } from "./CreateTeamModal";
import { DeleteTeamModal } from "./DeleteTeamModal";
import { RenameTeamModal } from "./RenameTeamModal";

interface SettingsModalsProps {
  isCreateTeamOpen: boolean;
  onCloseCreateTeam: () => void;
  isRenameTeamOpen: boolean;
  onCloseRenameTeam: () => void;
  onTeamSuccess: () => Promise<void>;
  currentTeamName: ComponentProps<typeof RenameTeamModal>["currentName"];
  isCreateInviteOpen: boolean;
  onCloseCreateInvite: () => void;
  onInvitesSuccess: () => Promise<void>;
  isDeleteTeamOpen: boolean;
  onCloseDeleteTeam: () => void;
}

export function SettingsModals({
  isCreateTeamOpen,
  onCloseCreateTeam,
  isRenameTeamOpen,
  onCloseRenameTeam,
  onTeamSuccess,
  currentTeamName,
  isCreateInviteOpen,
  onCloseCreateInvite,
  onInvitesSuccess,
  isDeleteTeamOpen,
  onCloseDeleteTeam,
}: SettingsModalsProps) {
  return (
    <>
      <CreateTeamModal isOpen={isCreateTeamOpen} onClose={onCloseCreateTeam} />
      <RenameTeamModal
        isOpen={isRenameTeamOpen}
        onClose={onCloseRenameTeam}
        onSuccess={onTeamSuccess}
        currentName={currentTeamName}
      />
      <CreateInviteModal
        isOpen={isCreateInviteOpen}
        onClose={onCloseCreateInvite}
        onSuccess={onInvitesSuccess}
      />
      <DeleteTeamModal isOpen={isDeleteTeamOpen} onClose={onCloseDeleteTeam} />
    </>
  );
}
