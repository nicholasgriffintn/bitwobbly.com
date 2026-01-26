import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { MFASetup } from '@bitwobbly/auth/components';

import Brand from '@/components/Brand';
import { getCurrentUserFn } from '@/server/functions/auth';

export const Route = createFileRoute('/setup-mfa')({
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) {
      throw redirect({ to: '/login' });
    }
    // TODO: Check if MFA is already set up and redirect if so
  },
  component: SetupMFA,
});

function SetupMFA() {
  const navigate = useNavigate();

  const handleComplete = async () => {
    // TODO: Does it not need to verify anything here?
    await navigate({ to: '/app' });
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>Enable Two-Factor Authentication</h1>
        <p>Protect your account with an additional layer of security.</p>
        <MFASetup onComplete={handleComplete} />
      </div>
    </div>
  );
}
