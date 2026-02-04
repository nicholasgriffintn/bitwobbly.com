import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { confirmStatusPageSubscriptionFn } from "@/server/functions/status-page-subscribers";

export const Route = createFileRoute("/status/$slug/confirm")({
  component: ConfirmStatusPageSubscription,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
});

function ConfirmStatusPageSubscription() {
  const { slug } = Route.useParams();
  const { token } = Route.useSearch();
  const confirm = useServerFn(confirmStatusPageSubscriptionFn);

  const [state, setState] = useState<
    | { kind: "working" }
    | { kind: "ok" }
    | { kind: "error"; message: string }
  >({ kind: "working" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) {
        setState({ kind: "error", message: "Missing confirmation token" });
        return;
      }

      try {
        await confirm({ data: { slug, token } });
        if (!cancelled) setState({ kind: "ok" });
      } catch (e) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [confirm, slug, token]);

  return (
    <div className="auth">
      <div className="auth-card">
        <h1>Subscription</h1>
        {state.kind === "working" && <p>Confirming…</p>}
        {state.kind === "ok" && (
          <>
            <p>Your subscription is now active.</p>
            <Link to="/status/$slug" params={{ slug }}>
              <button type="button">Back to status page</button>
            </Link>
          </>
        )}
        {state.kind === "error" && (
          <>
            <p>{state.message}</p>
            <Link to="/status/$slug" params={{ slug }}>
              <button type="button">Back to status page</button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

