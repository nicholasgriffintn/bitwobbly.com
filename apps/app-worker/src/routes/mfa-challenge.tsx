import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { MFAChallengeForm } from '@bitwobbly/auth/components';
import { useMFA } from '@bitwobbly/auth/react';

import Brand from '@/components/Brand';
import { getCurrentUserFn } from '@/server/functions/auth';

export const Route = createFileRoute('/mfa-challenge')({
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) {
      throw redirect({ to: '/login' });
    }
  },
  component: MFAChallengePage,
});

function MFAChallengePage() {
  const navigate = useNavigate();
  const { verifyMFA } = useMFA();

  const handleVerify = async (code: string) => {
    // TODO: MFA is not fully implemented yet
    const result = await verifyMFA(code, '', '');
    alert('MFA verification has not been fully implemented yet.');
    await navigate({ to: '/app' });
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>Confirm sign in</h1>
        <p>Please enter the 6-digit code from your authenticator app.</p>
        <MFAChallengeForm onVerify={handleVerify} className="auth-form" />
      </div>
    </div>
  );
}
