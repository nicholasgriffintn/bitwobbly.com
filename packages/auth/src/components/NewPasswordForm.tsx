import { useState, useRef, useEffect, type FormEvent } from "react";

export function NewPasswordForm({
  onSubmit,
  className,
}: {
  onSubmit: (password: string) => Promise<void>;
  className?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="form-group">
        <label htmlFor="new-password" className="block mb-1">
          New Password
        </label>
        <input
          ref={inputRef}
          id="new-password"
          type="password"
          className="w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter new password"
          disabled={loading}
          required
          minLength={8}
        />
      </div>
      <div className="form-group">
        <label htmlFor="confirm-password" className="block mb-1">
          Confirm Password
        </label>
        <input
          id="confirm-password"
          type="password"
          className="w-full"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          disabled={loading}
          required
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading || password.length < 8}>
        {loading ? "Setting password..." : "Set Password"}
      </button>
    </form>
  );
}
