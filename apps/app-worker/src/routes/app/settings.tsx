import { useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Card, CardTitle, Page, PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { ListContainer, ListRow } from "@/components/list";
import { Badge, Button } from "@/components/ui";
import { SettingsModals } from "@/components/modals/settings";
import {
  listTeamMembersFn,
  removeTeamMemberFn,
  updateMemberRoleFn,
  listTeamInvitesFn,
  revokeTeamInviteFn,
  getCurrentTeamFn,
} from "@/server/functions/teams";
import { seedDemoDataFn } from "@/server/functions/demo";
import { toTitleCase } from "@/utils/format";

type TeamMember = {
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
};

type TeamInvite = {
  inviteCode: string;
  email: string | null;
  role: string;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
};

export const Route = createFileRoute("/app/settings")({
  component: Settings,
  loader: async () => {
    const [currentTeam, membersResponse, invitesResponse] = await Promise.all([
      getCurrentTeamFn(),
      listTeamMembersFn(),
      listTeamInvitesFn(),
    ]);

    return {
      currentTeam,
      members: membersResponse.members,
      invites: invitesResponse.invites,
    };
  },
});

export default function Settings() {
  const {
    currentTeam: initialTeam,
    members: initialMembers,
    invites: initialInvites,
  } = Route.useLoaderData();
  const { user, teams } = useRouteContext({ from: "/app" });

  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [invites, setInvites] = useState<TeamInvite[]>(initialInvites);
  const [currentTeam, setCurrentTeam] = useState(initialTeam);
  const [error, setError] = useState<string | null>(null);

  const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isCreateInviteModalOpen, setIsCreateInviteModalOpen] = useState(false);
  const [isDeleteTeamModalOpen, setIsDeleteTeamModalOpen] = useState(false);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);

  const listTeamMembers = useServerFn(listTeamMembersFn);
  const removeTeamMember = useServerFn(removeTeamMemberFn);
  const updateMemberRole = useServerFn(updateMemberRoleFn);
  const listTeamInvites = useServerFn(listTeamInvitesFn);
  const revokeTeamInvite = useServerFn(revokeTeamInviteFn);
  const getCurrentTeam = useServerFn(getCurrentTeamFn);
  const seedDemoData = useServerFn(seedDemoDataFn);

  const currentUserTeam = teams?.find(
    (t) => t.id === (user?.currentTeamId || user?.teamId),
  );
  const isOwner = currentUserTeam?.role === "owner";

  const refreshMembers = async () => {
    try {
      const res = await listTeamMembers();
      setMembers(res.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const refreshInvites = async () => {
    try {
      const res = await listTeamInvites();
      setInvites(res.invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const refreshTeam = async () => {
    try {
      const team = await getCurrentTeam();
      setCurrentTeam(team);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onRemoveMember = async (userId: string) => {
    setError(null);
    if (!confirm("Are you sure you want to remove this team member?")) return;
    try {
      await removeTeamMember({ data: { userId } });
      await refreshMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onToggleRole = async (userId: string, currentRole: string) => {
    setError(null);
    const newRole = currentRole === "owner" ? "member" : "owner";
    if (
      !confirm(
        `Are you sure you want to change this user's role to ${newRole}?`,
      )
    )
      return;
    try {
      await updateMemberRole({ data: { userId, role: newRole } });
      await refreshMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onRevokeInvite = async (inviteCode: string) => {
    setError(null);
    if (!confirm("Are you sure you want to revoke this invite?")) return;
    try {
      await revokeTeamInvite({ data: { inviteCode } });
      await refreshInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSeedDemoData = async () => {
    setError(null);
    if (
      !confirm(
        "This will replace existing team resources with a full demo setup. Continue?",
      )
    ) {
      return;
    }

    setIsSeedingDemo(true);
    try {
      await seedDemoData();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSeedingDemo(false);
    }
  };

  const copyInviteLink = (inviteCode: string) => {
    const inviteUrl = `${window.location.origin}/join?code=${inviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
  };

  const activeInvites = invites.filter((inv) => !inv.usedAt);

  return (
    <Page className="page-stack">
      <PageHeader
        title="Team Settings"
        description="Manage your team members, invitations, and settings."
      >
        <div className="button-row">
          <Button
            type="button"
            variant="outline"
            color="success"
            onClick={() => {
              setError(null);
              setIsCreateTeamModalOpen(true);
            }}
          >
            New Team
          </Button>
        </div>
      </PageHeader>

      {error && <ErrorCard message={error} />}

      <Card>
        <CardTitle>Team Details</CardTitle>
        <ListRow
          title={currentTeam?.name || "Loading..."}
          actions={
            isOwner ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditNameModalOpen(true)}
                >
                  Rename
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  color="danger"
                  onClick={() => setIsDeleteTeamModalOpen(true)}
                >
                  Delete Team
                </Button>
              </>
            ) : null
          }
        />
      </Card>

      {isOwner && (
        <Card>
          <CardTitle>Demo Data</CardTitle>
          <ListRow
            title="Load full demo setup"
            subtitle="Seeds all core tables with varied sample data for monitors, incidents, status pages, alerting, and issue tracking."
            actions={
              <Button
                type="button"
                variant="outline"
                color="warning"
                onClick={onSeedDemoData}
                disabled={isSeedingDemo}
              >
                {isSeedingDemo ? "Seeding..." : "Load Demo Data"}
              </Button>
            }
          />
        </Card>
      )}

      <Card>
        <CardTitle>Team Members</CardTitle>
        <ListContainer isEmpty={!members.length} emptyMessage="No members yet.">
          {members.map((member) => (
            <ListRow
              key={member.userId}
              title={member.email}
              subtitleClassName="muted flex flex-wrap items-center gap-2"
              subtitle={
                <>
                  <Badge size="small">{toTitleCase(member.role)}</Badge>
                  <span>
                    · Joined {new Date(member.joinedAt).toLocaleDateString()}
                  </span>
                </>
              }
              actions={
                isOwner && member.userId !== user?.id ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onToggleRole(member.userId, member.role)}
                    >
                      {member.role === "owner" ? "Make Member" : "Make Owner"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      color="danger"
                      onClick={() => onRemoveMember(member.userId)}
                    >
                      Remove
                    </Button>
                  </>
                ) : null
              }
            />
          ))}
        </ListContainer>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-4">
          Team Invitations
          {isOwner && (
            <Button
              type="button"
              variant="outline"
              color="success"
              className="button-compact ml-auto"
              onClick={() => setIsCreateInviteModalOpen(true)}
            >
              Create Invite
            </Button>
          )}
        </CardTitle>
        <ListContainer isEmpty={!activeInvites.length} emptyMessage="No active invitations.">
          {activeInvites.map((invite) => {
            const isExpired = new Date(invite.expiresAt) < new Date();
            return (
              <ListRow
                key={invite.inviteCode}
                title={
                  <>
                    Invite Code:{" "}
                    <span className="font-mono">{invite.inviteCode}</span>
                  </>
                }
                subtitleClassName="muted flex flex-wrap items-center gap-2"
                subtitle={
                  <>
                    {invite.email && <span>For {invite.email} ·</span>}
                    <Badge size="small">{toTitleCase(invite.role)}</Badge>
                    <span>
                      ·{" "}
                      {isExpired ? (
                        <span className="text-[color:var(--primary-dark)]">
                          Expired
                        </span>
                      ) : (
                        `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                      )}
                    </span>
                  </>
                }
                actions={
                  isOwner ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => copyInviteLink(invite.inviteCode)}
                      >
                        Copy Link
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        color="warning"
                        onClick={() => onRevokeInvite(invite.inviteCode)}
                      >
                        Revoke
                      </Button>
                    </>
                  ) : null
                }
              />
            );
          })}
        </ListContainer>
      </Card>

      <SettingsModals
        isCreateTeamOpen={isCreateTeamModalOpen}
        onCloseCreateTeam={() => setIsCreateTeamModalOpen(false)}
        isRenameTeamOpen={isEditNameModalOpen}
        onCloseRenameTeam={() => setIsEditNameModalOpen(false)}
        onTeamSuccess={refreshTeam}
        currentTeamName={currentTeam?.name || ""}
        isCreateInviteOpen={isCreateInviteModalOpen}
        onCloseCreateInvite={() => setIsCreateInviteModalOpen(false)}
        onInvitesSuccess={refreshInvites}
        isDeleteTeamOpen={isDeleteTeamModalOpen}
        onCloseDeleteTeam={() => setIsDeleteTeamModalOpen(false)}
      />
    </Page>
  );
}
