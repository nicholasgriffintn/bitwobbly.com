import { useState, useRef, useEffect, type FormEvent } from 'react';

export function ResetPasswordForm({
  onSubmit,
  className,
}: {
  onSubmit: (data: { code: string; password: string }) => Promise<void>;
  className?: string;
}) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length < 6) {
      setError('Enter the 6-digit code');
      return;
    }
    if (password.length === 0) {
      setError('Enter your new password');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({ code, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="form-group">
        <label htmlFor="code" className="block mb-1">
          6-digit code
        </label>
        <input
          ref={inputRef}
          id="code"
          type="text"
          inputMode="numeric"
          className="w-full"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="6-digit code"
          disabled={loading}
          required
        />
      </div>
      <div>
        <label htmlFor="new-password" className="block mb-1">
          New Password
        </label>
        <input
          id="new-password"
          type="password"
          className="w-full"
          placeholder="Your new password"
          disabled={loading}
          required
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="block mb-1">
          Confirm New Password
        </label>
        <input
          id="confirm-password"
          type="password"
          className="w-full"
          placeholder="Confirm your new password"
          disabled={loading}
          required
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      <button
        type="submit"
        disabled={loading || code.length < 6 || password.length === 0}
      >
        {loading ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
