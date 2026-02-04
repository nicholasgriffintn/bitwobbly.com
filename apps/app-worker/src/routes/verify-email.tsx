import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { EmailVerification } from "@bitwobbly/auth/components";

import Brand from "@/components/Brand";
import {
  getCurrentUserFn,
  verifyEmailFn,
  resendVerificationCodeFn,
} from "@/server/functions/auth";

export const Route = createFileRoute("/verify-email")({
  beforeLoad: async () => {
    const { user, email } = await getCurrentUserFn();
    if (user?.emailVerified) {
      throw redirect({ to: "/app" });
    }
    if (!email && !user) {
      throw redirect({ to: "/login" });
    }
  },
  component: VerifyEmail,
});

function VerifyEmail() {
  const navigate = useNavigate();

  const handleVerify = async (code: string) => {
    await verifyEmailFn({ data: { code } });
    await navigate({ to: "/login" });
  };

  const handleResend = async () => {
    await resendVerificationCodeFn({ data: {} });
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
