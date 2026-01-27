import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { MFAChallengeForm } from '@bitwobbly/auth/components';

import Brand from '@/components/Brand';
import { getCurrentUserFn, verifyMFAFn } from '@/server/functions/auth';

export const Route = createFileRoute('/mfa-challenge')({
  beforeLoad: async () => {
    const { user, hasCognitoSession } = await getCurrentUserFn();
    if (!user && !hasCognitoSession) {
      throw redirect({ to: '/login' });
    }
  },
  component: MFAChallengePage,
});

function MFAChallengePage() {
  const navigate = useNavigate();

  const handleVerify = async (code: string) => {
    await verifyMFAFn({ data: { code } });
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
