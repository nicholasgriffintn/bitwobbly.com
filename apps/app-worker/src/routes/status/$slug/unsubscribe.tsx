import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { unsubscribeFromStatusPageFn } from "@/server/functions/status-page-subscribers";

export const Route = createFileRoute("/status/$slug/unsubscribe")({
  component: UnsubscribeStatusPage,
  validateSearch: (search: Record<string, unknown>) => ({
    sid: typeof search.sid === "string" ? search.sid : "",
    sig: typeof search.sig === "string" ? search.sig : "",
  }),
});

function UnsubscribeStatusPage() {
  const { slug } = Route.useParams();
  const { sid, sig } = Route.useSearch();
  const unsubscribe = useServerFn(unsubscribeFromStatusPageFn);

  const [state, setState] = useState<
    | { kind: "working" }
    | { kind: "ok" }
    | { kind: "error"; message: string }
  >({ kind: "working" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!sid || !sig) {
        setState({ kind: "error", message: "Missing unsubscribe link data" });
        return;
      }

      try {
        await unsubscribe({ data: { slug, sid, sig } });
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
  }, [sid, sig, slug, unsubscribe]);

  return (
    <div className="auth">
      <div className="auth-card">
        <h1>Unsubscribe</h1>
        {state.kind === "working" && <p>Unsubscribing…</p>}
        {state.kind === "ok" && (
          <>
            <p>You have been unsubscribed.</p>
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

