import { useState } from "react";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { Badge } from "@/components/ui";
import {
  CreateTeamModal,
  RenameTeamModal,
  CreateInviteModal,
  DeleteTeamModal,
} from "@/components/modals/settings";
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

  return (
    <div className="page page-stack">
      <PageHeader
        title="Team Settings"
        description="Manage your team members, invitations, and settings."
      >
        <div className="button-row">
          <button
            type="button"
            className="outline button-success"
            onClick={() => {
              setError(null);
              setIsCreateTeamModalOpen(true);
            }}
          >
            New Team
          </button>
        </div>
      </PageHeader>

      {error && <ErrorCard message={error} />}

      <div className="card">
        <div className="card-title">Team Details</div>
        <div className="list">
          <div className="list-row">
            <div className="flex-1">
              <div className="list-title">
                {currentTeam?.name || "Loading..."}
              </div>
            </div>
            <div className="button-row">
              {isOwner && (
                <>
                  <button
                    type="button"
                    className="outline"
                    onClick={() => setIsEditNameModalOpen(true)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="outline button-danger"
                    onClick={() => setIsDeleteTeamModalOpen(true)}
                  >
                    Delete Team
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="card">
          <div className="card-title">Demo Data</div>
          <div className="list">
            <div className="list-row">
              <div className="flex-1">
                <div className="list-title">Load full demo setup</div>
                <div className="muted">
                  Seeds all core tables with varied sample data for monitors,
                  incidents, status pages, alerting, and issue tracking.
                </div>
              </div>
              <button
                type="button"
                className="outline button-warning"
                onClick={onSeedDemoData}
                disabled={isSeedingDemo}
              >
                {isSeedingDemo ? "Seeding..." : "Load Demo Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Team Members</div>
        <div className="list">
          {members.length ? (
            members.map((member) => (
              <div key={member.userId} className="list-row">
                <div className="flex-1">
                  <div className="list-title">{member.email}</div>
                  <div className="muted flex flex-wrap items-center gap-2">
                    <Badge size="small">{toTitleCase(member.role)}</Badge>
                    <span>
                      · Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {isOwner && member.userId !== user?.id && (
                  <div className="button-row">
                    <button
                      type="button"
                      className="outline"
                      onClick={() => onToggleRole(member.userId, member.role)}
                    >
                      {member.role === "owner" ? "Make Member" : "Make Owner"}
                    </button>
                    <button
                      type="button"
                      className="outline button-danger"
                      onClick={() => onRemoveMember(member.userId)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="muted">No members yet.</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title flex items-center gap-4">
          Team Invitations
          {isOwner && (
            <button
              type="button"
              className="outline button-success button-compact ml-auto"
              onClick={() => setIsCreateInviteModalOpen(true)}
            >
              Create Invite
            </button>
          )}
        </div>
        <div className="list">
          {invites.filter((inv) => !inv.usedAt).length ? (
            invites
              .filter((inv) => !inv.usedAt)
              .map((invite) => {
                const isExpired = new Date(invite.expiresAt) < new Date();
                return (
                  <div key={invite.inviteCode} className="list-row">
                    <div className="flex-1">
                      <div className="list-title">
                        Invite Code:{" "}
                        <span className="font-mono">{invite.inviteCode}</span>
                      </div>
                      <div className="muted flex flex-wrap items-center gap-2">
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
                      </div>
                    </div>
                    {isOwner && (
                      <div className="button-row">
                        <button
                          type="button"
                          className="outline"
                          onClick={() => copyInviteLink(invite.inviteCode)}
                        >
                          Copy Link
                        </button>
                        <button
                          type="button"
                          className="outline button-warning"
                          onClick={() => onRevokeInvite(invite.inviteCode)}
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
          ) : (
            <div className="muted">No active invitations.</div>
          )}
        </div>
      </div>

      <CreateTeamModal
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
      />

      <RenameTeamModal
        isOpen={isEditNameModalOpen}
        onClose={() => setIsEditNameModalOpen(false)}
        onSuccess={refreshTeam}
        currentName={currentTeam?.name || ""}
      />

      <CreateInviteModal
        isOpen={isCreateInviteModalOpen}
        onClose={() => setIsCreateInviteModalOpen(false)}
        onSuccess={refreshInvites}
      />

      <DeleteTeamModal
        isOpen={isDeleteTeamModalOpen}
        onClose={() => setIsDeleteTeamModalOpen(false)}
      />
    </div>
  );
}
