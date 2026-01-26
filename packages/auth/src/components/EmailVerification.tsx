import { useState, type FormEvent } from "react";

export function EmailVerification({
  onVerify,
  onResend,
  className,
}: {
  onVerify: (code: string) => Promise<void>;
  onResend?: () => Promise<void>;
  className?: string;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError('Enter a 6-digit code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onVerify(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
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
      setError('Verification code sent!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="form-group">
        <label htmlFor="verification-code" className="block mb-1">
          Enter 6-digit code
        </label>
        <input
          type="text"
          inputMode="numeric"
          id="verification-code"
          className="w-full"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          autoFocus
          disabled={loading}
          required
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading || code.length !== 6}>
        {loading ? 'Verifying...' : 'Verify Email'}
      </button>
      {onResend && (
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="link-button"
        >
          {resending ? 'Sending...' : 'Resend code'}
        </button>
      )}
    </form>
  );
}
