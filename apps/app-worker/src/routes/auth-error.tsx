import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import Brand from "@/components/Brand";

const searchSchema = z.object({
  challenge: z.string().optional(),
});

export const Route = createFileRoute("/auth-error")({
  validateSearch: (search) => searchSchema.parse(search),
  component: AuthErrorPage,
});

function AuthErrorPage() {
  const { challenge } = Route.useSearch();

  return (
    <div className="auth">
      <div className="auth-card">
        <Brand />
        <h1>Authentication Required</h1>
        <p>
          Your account requires an authentication method that isn't supported
          yet.
        </p>
        {challenge && (
          <div className="auth-error-details">
            <p>
              <strong>Challenge type:</strong> {challenge}
            </p>
            <p>
              Please contact your administrator or try a different sign-in
              method.
            </p>
          </div>
        )}
        <div className="auth-actions" style={{ marginTop: "1.5rem" }}>
          <Link to="/login" className="button">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
