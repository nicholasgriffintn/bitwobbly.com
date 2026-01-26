import { useState, useEffect } from 'react';
import {
  createFileRoute,
  redirect,
  useNavigate,
  isRedirect,
} from '@tanstack/react-router';

import Brand from '@/components/Brand';
import { getCurrentUserFn } from '@/server/functions/auth';
import { joinTeamFn } from '@/server/functions/teams';

export const Route = createFileRoute('/join')({
  validateSearch: (search: Record<string, unknown>) => ({
    code: (search.code as string) || '',
  }),
  beforeLoad: async () => {
    const user = await getCurrentUserFn();

    if (!user) {
      throw redirect({
        to: '/login',
      });
    }
  },
  component: Join,
});

function Join() {
  const navigate = useNavigate();
  const { code } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!code) {
      setError('No invite code provided.');
      return;
    }

    const attemptJoin = async () => {
      setSubmitting(true);
      setError(null);

      try {
        await joinTeamFn({ data: { inviteCode: code } });
        setJoined(true);
        await navigate({ to: '/app' });
      } catch (err) {
        if (isRedirect(err)) {
          throw err;
        }
        setError(err instanceof Error ? err.message : 'Failed to join team');
        setSubmitting(false);
      }
    };

    attemptJoin();
  }, [code, navigate]);

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>Join team</h1>
        {submitting && !error && !joined && <p>Joining team...</p>}
        {joined && <p>Successfully joined! Redirecting...</p>}
        {error && (
          <>
            <div className="form-error">{error}</div>
            <div style={{ marginTop: '16px' }}>
              <button type="button" onClick={() => navigate({ to: '/app' })}>
                Go to dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
