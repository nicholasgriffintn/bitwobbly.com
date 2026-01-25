import { useState, type FormEvent } from "react";
import {
  createFileRoute,
  redirect,
  useNavigate,
  isRedirect,
} from "@tanstack/react-router";

import Brand from "@/components/Brand";
import { getCurrentUserFn } from "@/server/functions/auth";
import { createTeamFn, joinTeamFn } from "@/server/functions/teams";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) {
      throw redirect({ to: "/login" });
    }
    if (user.currentTeamId) {
      throw redirect({ to: "/app" });
    }
  },
  component: Onboarding,
});

export default function Onboarding() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"choice" | "create" | "join">("choice");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreateTeam = async (event: FormEvent) => {
    event.preventDefault();
    if (!teamName.trim()) {
      setError("Team name is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createTeamFn({ data: { name: teamName.trim() } });
      await navigate({ to: "/app" });
    } catch (err) {
      if (isRedirect(err)) {
        throw err;
      }
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinTeam = async (event: FormEvent) => {
    event.preventDefault();
    if (!inviteCode.trim()) {
      setError("Invite code is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await joinTeamFn({ data: { inviteCode: inviteCode.trim() } });
      await navigate({ to: "/app" });
    } catch (err) {
      if (isRedirect(err)) {
        throw err;
      }
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === "choice") {
    return (
      <div className="auth">
        <div className="auth-card">
          <Brand />
          <h1>Welcome to BitWobbly</h1>
          <p>To get started, create a new team or join an existing one.</p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <button
              type="button"
              onClick={() => setMode("create")}
              className="primary"
            >
              Create a new team
            </button>
            <button
              type="button"
              onClick={() => setMode("join")}
              className="secondary"
            >
              Join an existing team
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="auth">
        <div className="auth-card">
          <Brand />
          <h1>Create a team</h1>
          <p>Choose a name for your team. You can change this later.</p>
          <form onSubmit={handleCreateTeam} className="auth-form">
            <label htmlFor="teamName">Team name</label>
            <input
              id="teamName"
              type="text"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="My Company"
              autoComplete="off"
              required
            />
            {error ? <div className="form-error">{error}</div> : null}
            <button type="submit" disabled={submitting}>
              {submitting ? "Creating team..." : "Create team"}
            </button>
          </form>
          <div className="auth-toggle">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMode("choice");
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>Join a team</h1>
        <p>Enter the invite code you received from your team administrator.</p>
        <form onSubmit={handleJoinTeam} className="auth-form">
          <label htmlFor="inviteCode">Invite code</label>
          <input
            id="inviteCode"
            type="text"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="Enter your invite code"
            autoComplete="off"
            required
          />
          {error ? <div className="form-error">{error}</div> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Joining team..." : "Join team"}
          </button>
        </form>
        <div className="auth-toggle">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setMode("choice");
              setError(null);
            }}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
