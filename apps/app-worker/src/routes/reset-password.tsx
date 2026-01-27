import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ResetPasswordForm } from '@bitwobbly/auth/components';
import { z } from 'zod';

import Brand from '@/components/Brand';
import { resetPasswordFn } from '@/server/functions/auth';

const searchSchema = z.object({
    email: z.string().email().optional(),
});

export const Route = createFileRoute('/reset-password')({
    validateSearch: (search) => searchSchema.parse(search),
    component: ResetPassword,
});

function ResetPassword() {
    const navigate = useNavigate();
    const search = Route.useSearch();

    const handleReset = async (data: { code: string; password: string }) => {
      await resetPasswordFn({
        data: {
          email: search.email || '',
          code: data.code,
          password: data.password,
        },
      });
      await navigate({ to: '/login' });
    };

    return (
      <div className="auth">
        <div className="auth-card">
          <Brand />
          <h1>Set Your New Password</h1>
          <p>Enter the code sent to your email and your new password.</p>
          <ResetPasswordForm onSubmit={handleReset} className="auth-form" />
        </div>
      </div>
    );
}
