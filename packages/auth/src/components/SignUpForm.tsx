import { useState, type FormEvent } from 'react';

import { useAuth } from '../react/AuthProvider';

export function SignUpForm({
  onSuccess,
  className,
}: {
  onSuccess?: () => void;
  className?: string;
}) {
  const { signUp, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password || !inviteCode.trim()) {
      setError('All fields are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signUp(email, password, inviteCode);
      onSuccess?.();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'isRedirect' in err) {
        throw err;
      }
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={className}>
      <div className="form-group">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading || submitting}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading || submitting}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="inviteCode">Invite Code</label>
        <input
          id="inviteCode"
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          disabled={loading || submitting}
          required
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading || submitting}>
        {submitting ? 'Signing up...' : 'Sign Up'}
      </button>
    </form>
  );
}
