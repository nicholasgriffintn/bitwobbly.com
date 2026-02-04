import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { unlockPrivateStatusPageFn } from "@/server/functions/public";

export function PrivateStatusPasswordGate({
  slug,
  page,
}: {
  slug: string;
  page: { name: string; logo_url: string | null; brand_color: string | null };
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unlock = useServerFn(unlockPrivateStatusPageFn);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await unlock({ data: { slug, password } });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        {page.logo_url && (
          <img
            src={page.logo_url}
            alt={page.name}
            style={{ maxWidth: 180, height: "auto", marginBottom: 16 }}
          />
        )}
        <h1 style={{ marginBottom: 8 }}>{page.name}</h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          This status page is password protected.
        </p>

        <form className="form" onSubmit={onSubmit}>
          {error && <div className="form-error">{error}</div>}
          <label htmlFor="status-password">Password</label>
          <input
            id="status-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button type="submit" style={{ width: "100%", marginTop: 12 }}>
            View status
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/">
            <button type="button" className="outline">
              Go home
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
