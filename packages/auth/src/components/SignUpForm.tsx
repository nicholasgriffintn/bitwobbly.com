import { useState, type FormEvent } from "react";

import { useAuth } from "../react/AuthProvider";

export function SignUpForm({
  onSuccess,
  className,
}: {
  onSuccess?: () => void;
  className?: string;
}) {
  const { signUp, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password || !inviteCode.trim()) {
      setError("All fields are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signUp(email, password, inviteCode);
      onSuccess?.();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "isRedirect" in err) {
        throw err;
      }
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={className}>
      <div className="form-group">
        <label htmlFor="email" className="block mb-1">
          Email
        </label>
        <input
          className="w-full"
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading || submitting}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="password" className="block mb-1">
          Password
        </label>
        <input
          className="w-full"
          id="password"
          type="password"
          placeholder="Enter your chosen password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading || submitting}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="confirmPassword" className="block mb-1">
          Confirm Password
        </label>
        <input
          className="w-full"
          id="confirmPassword"
          type="password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading || submitting}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="inviteCode" className="block mb-1">
          Invite Code
        </label>
        <input
          className="w-full"
          id="inviteCode"
          type="text"
          placeholder="Enter the invite code provided to you"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          disabled={loading || submitting}
          required
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading || submitting}>
        {submitting ? "Signing up..." : "Sign Up"}
      </button>
    </form>
  );
}
