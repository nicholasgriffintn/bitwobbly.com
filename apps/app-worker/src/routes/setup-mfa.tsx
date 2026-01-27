import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { MFASetup } from "@bitwobbly/auth/components";

import Brand from "@/components/Brand";
import { getCurrentUserFn } from "@/server/functions/auth";

export const Route = createFileRoute("/setup-mfa")({
  beforeLoad: async () => {
    const { user, hasCognitoSession } = await getCurrentUserFn();
    if (!user && !hasCognitoSession) {
      throw redirect({ to: "/login" });
    }
    if (user?.mfaEnabled) {
      throw redirect({ to: '/app' });
    }
  },
  component: SetupMFA,
});

function SetupMFA() {
  const navigate = useNavigate();

  const handleComplete = async () => {
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
