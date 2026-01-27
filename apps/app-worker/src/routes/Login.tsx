import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginForm, SignUpForm } from "@bitwobbly/auth/components";

import Brand from "@/components/Brand";
import { getCurrentUserFn } from "@/server/functions/auth";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { user } = await getCurrentUserFn();
    if (user) {
      throw redirect({ to: "/app" });
    }
  },
  component: Login,
});

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>{isSignUp ? "Create account" : "Sign in"}</h1>
        <p>
          {isSignUp
            ? "Start monitoring your services with real-time alerts and beautiful status pages."
            : "Welcome back! Sign in to access your monitoring dashboard."}
        </p>

        {isSignUp ? (
          <SignUpForm className="auth-form" />
        ) : (
          <LoginForm className="auth-form" />
        )}

        {!isSignUp && (
          <div className="auth-forgot-password">
            <a href="/forgot-password" className="link-button">
              Forgot password?
            </a>
          </div>
        )}

        <div className="auth-toggle">
          <button
            type="button"
            className="link-button"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "Need an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
