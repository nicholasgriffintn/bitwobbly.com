import { useState, type FormEvent } from 'react';
import { createFileRoute, useNavigate, isRedirect } from '@tanstack/react-router';

import { useAuth } from '@/context/auth';
import Brand from '@/components/Brand';

export const Route = createFileRoute('/login')({ component: Login });

export default function Login() {
  const { signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
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
      if (isSignUp) {
        await signUp(email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
      await navigate({
        to: '/app',
      });
    } catch (err) {
      if (isRedirect(err)) {
        return;
      }
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>{isSignUp ? 'Create account' : 'Sign in to BitWobbly'}</h1>
        <p>
          {isSignUp
            ? 'Start monitoring your services with real-time alerts and beautiful status pages.'
            : 'Welcome back! Sign in to access your monitoring dashboard.'
          }
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete={isSignUp ? 'email' : 'username'}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isSignUp ? 'Create a strong password' : 'Enter your password'}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
          />
          {error ? <div className="form-error">{error}</div> : null}
          <button type="submit" disabled={loading || submitting}>
            {submitting
              ? (isSignUp ? 'Creating account...' : 'Signing in...')
              : (isSignUp ? 'Create account' : 'Sign in')
            }
          </button>
        </form>
        <div className="auth-toggle">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : 'Need an account? Sign up'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
