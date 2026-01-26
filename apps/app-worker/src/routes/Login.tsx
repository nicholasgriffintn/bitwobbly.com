import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { LoginForm, SignUpForm } from '@bitwobbly/auth/components';

import Brand from "@/components/Brand";
import { getCurrentUserFn } from "@/server/functions/auth";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (user) {
      throw redirect({ to: "/app" });
    }
  },
  component: Login,
});

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleSuccess = async () => {
    await navigate({ to: '/app' });
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>{isSignUp ? 'Create account' : 'Sign in to BitWobbly'}</h1>
        <p>
          {isSignUp
            ? 'Start monitoring your services with real-time alerts and beautiful status pages.'
            : 'Welcome back! Sign in to access your monitoring dashboard.'}
        </p>
        
        {isSignUp ? (
          <SignUpForm
            className="auth-form"
            onSuccess={handleSuccess}
          />
        ) : (
          <LoginForm
            className="auth-form"
            onSuccess={handleSuccess}
          />
        )}
        
        <div className="auth-toggle">
          <button
            type="button"
            className="link-button"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : 'Need an account? Sign up'}
          </button>
        </div>
      </div>
    </div>
  );
}
