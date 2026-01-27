import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { NewPasswordForm } from "@bitwobbly/auth/components";

import Brand from "@/components/Brand";
import { getCurrentUserFn, newPasswordFn } from "@/server/functions/auth";

export const Route = createFileRoute("/new-password")({
  beforeLoad: async () => {
    const { user, hasCognitoSession } = await getCurrentUserFn();
    if (!hasCognitoSession) {
      throw redirect({ to: "/login" });
    }
    if (user) {
      throw redirect({ to: "/app" });
    }
  },
  component: NewPasswordPage,
});

function NewPasswordPage() {
  const navigate = useNavigate();

  const handleSubmit = async (password: string) => {
    await newPasswordFn({ data: { password } });
    await navigate({ to: "/app" });
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>Set a New Password</h1>
        <p>Your administrator requires you to change your password.</p>
        <NewPasswordForm onSubmit={handleSubmit} className="auth-form" />
      </div>
    </div>
  );
}
