import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ForgotPasswordForm } from '@bitwobbly/auth/components';

import Brand from '@/components/Brand';
import { forgotPasswordFn } from '@/server/functions/auth';

export const Route = createFileRoute('/forgot-password')({
    component: ForgotPassword,
});

function ForgotPassword() {
    const navigate = useNavigate();

    const handleRequest = async (email: string) => {
        await forgotPasswordFn({ data: { email } });
        await navigate({ to: '/reset-password', search: { email } });
    };

    return (
      <div className="auth">
        <div className="auth-card">
          <Brand />
          <h1>Forgot your password?</h1>
          <p>Enter your email address to receive a password reset code.</p>
          <ForgotPasswordForm onSubmit={handleRequest} className="auth-form" />
        </div>
      </div>
    );
}
