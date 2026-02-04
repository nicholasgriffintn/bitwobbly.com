import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { SuccessBox, SecretDisplay } from "@/components/feedback";
import { createTeamInviteFn } from "@/server/functions/teams";

interface CreateInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function CreateInviteModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateInviteModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [expiry, setExpiry] = useState("7");
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const createTeamInvite = useServerFn(createTeamInviteFn);

  const handleClose = () => {
    setEmail("");
    setRole("member");
    setExpiry("7");
    setCreatedInviteCode(null);
    setError(null);
    onClose();
  };

  const onCreateInvite = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await createTeamInvite({
        data: {
          email: email || undefined,
          role: role as "owner" | "member",
          expiresInDays: Number(expiry),
        },
      });
      setCreatedInviteCode(result.inviteCode);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const inviteUrl =
    typeof window !== "undefined" && createdInviteCode
      ? `${window.location.origin}/join?code=${createdInviteCode}`
      : "";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Team Invite">
      {createdInviteCode ? (
        <div className="form">
          <SuccessBox title="Invite Created" className="mb-4">
            <SecretDisplay
              label="Invite Link"
              value={inviteUrl}
              copyable={false}
            />
            <SecretDisplay
              label="Invite Code"
              value={createdInviteCode}
              copyable={false}
            />
          </SuccessBox>
          <div className="button-row">
            <button type="button" onClick={handleClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form className="form" onSubmit={onCreateInvite}>
          {error && <div className="form-error">{error}</div>}
          <label htmlFor="invite-email">Email (optional)</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />

          <label htmlFor="invite-role">Role</label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
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
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />

          <FormActions>
            <button type="submit" className="button-success">
              Create Invite
            </button>
            <button type="button" className="outline" onClick={handleClose}>
              Cancel
            </button>
          </FormActions>
        </form>
      )}
    </Modal>
  );
}
