import { useState, type FormEvent } from 'react';
import { createFileRoute, useRouteContext } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';

import { Modal } from '@/components/Modal';
import {
  listTeamMembersFn,
  removeTeamMemberFn,
  updateMemberRoleFn,
  listTeamInvitesFn,
  createTeamInviteFn,
  revokeTeamInviteFn,
  updateTeamNameFn,
  deleteTeamFn,
  getCurrentTeamFn,
} from '@/server/functions/teams';
import { seedDemoDataFn } from '@/server/functions/demo';
import { toTitleCase } from '@/utils/format';

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

export const Route = createFileRoute('/app/settings')({
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
  const { user, teams } = useRouteContext({ from: '/app' });

  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [invites, setInvites] = useState<TeamInvite[]>(initialInvites);
  const [currentTeam, setCurrentTeam] = useState(initialTeam);
  const [error, setError] = useState<string | null>(null);

  const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
  const [teamName, setTeamName] = useState(currentTeam?.name || '');

  const [isCreateInviteModalOpen, setIsCreateInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteExpiry, setInviteExpiry] = useState('7');
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(
    null,
  );

  const [isDeleteTeamModalOpen, setIsDeleteTeamModalOpen] = useState(false);
  const [isSeedingDemo, setIsSeedingDemo] = useState(false);

  const listTeamMembers = useServerFn(listTeamMembersFn);
  const removeTeamMember = useServerFn(removeTeamMemberFn);
  const updateMemberRole = useServerFn(updateMemberRoleFn);
  const listTeamInvites = useServerFn(listTeamInvitesFn);
  const createTeamInvite = useServerFn(createTeamInviteFn);
  const revokeTeamInvite = useServerFn(revokeTeamInviteFn);
  const updateTeamName = useServerFn(updateTeamNameFn);
  const deleteTeam = useServerFn(deleteTeamFn);
  const getCurrentTeam = useServerFn(getCurrentTeamFn);
  const seedDemoData = useServerFn(seedDemoDataFn);

  const currentUserTeam = teams?.find(
    (t) => t.id === (user?.currentTeamId || user?.teamId),
  );
  const isOwner = currentUserTeam?.role === 'owner';

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
      if (team) setTeamName(team.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onRemoveMember = async (userId: string) => {
    setError(null);
    if (!confirm('Are you sure you want to remove this team member?')) return;
    try {
      await removeTeamMember({ data: { userId } });
      await refreshMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onToggleRole = async (userId: string, currentRole: string) => {
    setError(null);
    const newRole = currentRole === 'owner' ? 'member' : 'owner';
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

  const onUpdateTeamName = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await updateTeamName({ data: { name: teamName } });
      await refreshTeam();
      setIsEditNameModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onCreateInvite = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await createTeamInvite({
        data: {
          email: inviteEmail || undefined,
          role: inviteRole as 'owner' | 'member',
          expiresInDays: Number(inviteExpiry),
        },
      });
      setCreatedInviteCode(result.inviteCode);
      await refreshInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const closeCreateInviteModal = () => {
    setIsCreateInviteModalOpen(false);
    setCreatedInviteCode(null);
    setInviteEmail('');
    setInviteRole('member');
    setInviteExpiry('7');
  };

  const onRevokeInvite = async (inviteCode: string) => {
    setError(null);
    if (!confirm('Are you sure you want to revoke this invite?')) return;
    try {
      await revokeTeamInvite({ data: { inviteCode } });
      await refreshInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDeleteTeam = async () => {
    setError(null);
    try {
      await deleteTeam();
      window.location.href = '/app';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsDeleteTeamModalOpen(false);
    }
  };

  const onSeedDemoData = async () => {
    setError(null);
    if (
      !confirm(
        'This will replace existing team resources with a full demo setup. Continue?',
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
      <div className="page-header">
        <div>
          <h1>Team Settings</h1>
          <p>Manage your team members, invitations, and settings.</p>
        </div>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div className="card-title">Team Details</div>
        <div className="list">
          <div className="list-row">
            <div style={{ flex: 1 }}>
              <div className="list-title">
                {currentTeam?.name || 'Loading...'}
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
              <div style={{ flex: 1 }}>
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
                {isSeedingDemo ? 'Seeding...' : 'Load Demo Data'}
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
                <div style={{ flex: 1 }}>
                  <div className="list-title">{member.email}</div>
                  <div className="muted">
                    <span className="pill small">
                      {toTitleCase(member.role)}
                    </span>
                    {' · '}
                    Joined {new Date(member.joinedAt).toLocaleDateString()}
                  </div>
                </div>
                {isOwner && member.userId !== user?.id && (
                  <div className="button-row">
                    <button
                      type="button"
                      className="outline"
                      onClick={() => onToggleRole(member.userId, member.role)}
                    >
                      {member.role === 'owner' ? 'Make Member' : 'Make Owner'}
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
        <div
          className="card-title"
          style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
        >
          Team Invitations
          {isOwner && (
            <button
              type="button"
              className="outline button-success"
              onClick={() => setIsCreateInviteModalOpen(true)}
              style={{
                marginLeft: 'auto',
                fontSize: '0.875rem',
                padding: '0.25rem 0.75rem',
              }}
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
                    <div style={{ flex: 1 }}>
                      <div className="list-title">
                        Invite Code:{' '}
                        <span style={{ fontFamily: 'monospace' }}>
                          {invite.inviteCode}
                        </span>
                      </div>
                      <div className="muted">
                        {invite.email && `For ${invite.email} · `}
                        <span className="pill small">
                          {toTitleCase(invite.role)}
                        </span>
                        {' · '}
                        {isExpired ? (
                          <span style={{ color: '#dc3545' }}>Expired</span>
                        ) : (
                          `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                        )}
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

      <Modal
        isOpen={isEditNameModalOpen}
        onClose={() => setIsEditNameModalOpen(false)}
        title="Rename Team"
      >
        <form className="form" onSubmit={onUpdateTeamName}>
          <label htmlFor="team-name">Team Name</label>
          <input
            id="team-name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="My Team"
            required
          />
          <div className="button-row" style={{ marginTop: '1rem' }}>
            <button type="submit">Save</button>
            <button
              type="button"
              className="outline"
              onClick={() => setIsEditNameModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isCreateInviteModalOpen}
        onClose={closeCreateInviteModal}
        title="Create Team Invite"
      >
        {createdInviteCode ? (
          <div className="form">
            <div
              style={{
                padding: '1rem',
                marginBottom: '1rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                border: '2px solid #28a745',
              }}
            >
              <div
                style={{
                  marginBottom: '0.75rem',
                  color: '#28a745',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                <span>✓</span>
                Invite Created
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  Invite Link
                </label>
                <input
                  readOnly
                  value={`${window.location.origin}/join?code=${createdInviteCode}`}
                  onClick={(e) => e.currentTarget.select()}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  Invite Code
                </label>
                <input
                  readOnly
                  value={createdInviteCode}
                  onClick={(e) => e.currentTarget.select()}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                />
              </div>
            </div>
            <div className="button-row">
              <button type="button" onClick={closeCreateInviteModal}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={onCreateInvite}>
            <label htmlFor="invite-email">Email (optional)</label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
            />

            <label htmlFor="invite-role">Role</label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>

            <label htmlFor="invite-expiry">Expires In (days)</label>
            <input
              id="invite-expiry"
              type="number"
              min="1"
              max="30"
              value={inviteExpiry}
              onChange={(e) => setInviteExpiry(e.target.value)}
            />

            <div className="button-row" style={{ marginTop: '1rem' }}>
              <button type="submit" className="button-success">
                Create Invite
              </button>
              <button
                type="button"
                className="outline"
                onClick={closeCreateInviteModal}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={isDeleteTeamModalOpen}
        onClose={() => setIsDeleteTeamModalOpen(false)}
        title="Delete Team"
      >
        <div className="form">
          <p>
            Are you sure you want to delete this team? This action cannot be
            undone. You must first delete all monitors, status pages, and
            projects associated with this team.
          </p>
          <div className="button-row" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="outline button-danger"
              onClick={onDeleteTeam}
            >
              Delete Team
            </button>
            <button
              type="button"
              className="outline"
              onClick={() => setIsDeleteTeamModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
