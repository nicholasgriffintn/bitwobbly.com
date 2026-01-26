import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { EmailVerification } from '@bitwobbly/auth/components';

import Brand from '@/components/Brand';
import { getCurrentUserFn } from '@/server/functions/auth';

export const Route = createFileRoute('/verify-email')({
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (user?.emailVerified) {
      throw redirect({ to: '/app' });
    }
  },
  component: VerifyEmail,
});

function VerifyEmail() {
  const navigate = useNavigate();

  const handleVerify = async (_code: string) => {
    // TODO: Implement email verification logic when available in auth package
    alert('Email verification has not been implemented yet.');
    await navigate({ to: '/app' });
  };

  const handleResend = async () => {
    // TODO: Implement email resend logic when available in auth package
    alert('Email verification has not been implemented yet.');
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>Verify Your Email</h1>
        <p>Please enter the verification code sent to your email address.</p>
        <EmailVerification
          onVerify={handleVerify}
          onResend={handleResend}
          className="auth-form"
        />
      </div>
    </div>
  );
}
