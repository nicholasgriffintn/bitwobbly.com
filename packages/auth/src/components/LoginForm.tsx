import { useState, type FormEvent } from 'react';

import { useAuth } from '../react/AuthProvider';

export function LoginForm({
  onSuccess,
  className,
}: {
  onSuccess?: () => void;
  className?: string;
}) {
  const { signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter email and password to continue.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      // TODO: This needs to handle MFA setup/ challenge flows -signin should return state
      // TODO: This needs to handle email verification flows -signin should return state
      onSuccess?.();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'isRedirect' in err) {
        throw err;
      }
      setError(err instanceof Error ? err.message : 'Sign in failed');
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
          placeholder="Enter your email address"
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
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading || submitting}
          required
        />
      </div>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading || submitting}>
        {submitting ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
