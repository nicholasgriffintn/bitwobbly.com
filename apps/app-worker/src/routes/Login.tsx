import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import Brand from '../components/Brand';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password to continue.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      login(res.token);
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>Sign in to the control room</h1>
        <p>
          Sign in with the fixed admin account for now. We will replace this
          with full authentication once the user system lands.
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin"
            autoComplete="username"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
          {error ? <div className="form-error">{error}</div> : null}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Enter dashboard'}
          </button>
        </form>
        <div className="auth-hint">
          Need credentials? Run <code>wrangler secret put ADMIN_USERNAME</code>{' '}
          and <code>wrangler secret put ADMIN_PASSWORD</code>
        </div>
      </div>
    </div>
  );
}
