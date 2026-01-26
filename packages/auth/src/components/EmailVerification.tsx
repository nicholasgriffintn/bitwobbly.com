import { useState, type FormEvent } from "react";

export function EmailVerification({
  email,
  onVerify,
  onResend,
}: {
  email: string;
  onVerify: (code: string) => Promise<void>;
  onResend?: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter a 6-digit code");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onVerify(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!onResend) return;
    setResending(true);
    setError(null);
    try {
      await onResend();
      setError("Verification code sent!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="email-verification">
      <h3>Verify Your Email</h3>
      <p>We sent a verification code to {email}</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          autoFocus
          disabled={loading}
          required
        />
        {error && <div className="form-error">{error}</div>}
        <button type="submit" disabled={loading || code.length !== 6}>
          {loading ? "Verifying..." : "Verify Email"}
        </button>
      </form>
      {onResend && (
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="link-button"
        >
          {resending ? "Sending..." : "Resend code"}
        </button>
      )}
    </div>
  );
}
