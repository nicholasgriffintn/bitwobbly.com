import { createFileRoute, Link } from "@tanstack/react-router";

import { listSentryEventsFn } from "@/server/functions/sentry";

type Event = {
  id: string;
  type: string;
  level: string | null;
  message: string | null;
  receivedAt: number;
  issueId: string | null;
};

export const Route = createFileRoute("/app/issues/$projectId/issue/$issueId")({
  component: IssueDetail,
  loader: async ({ params }) => {
    const eventsRes = await listSentryEventsFn({
      data: { projectId: params.projectId },
    });
    const issueEvents = eventsRes.events.filter(
      (e: Event) => e.issueId === params.issueId,
    );
    return { events: issueEvents };
  },
});

function IssueDetail() {
  const { projectId } = Route.useParams();
  const { events } = Route.useLoaderData();

  return (
    <div className="page">
      <div className="page-header mb-6">
        <div>
          <h2>Issue Detail</h2>
          <p className="muted">
            <Link to="/app/issues/$projectId" params={{ projectId }}>
              ← Back to project
            </Link>
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Events ({events.length})</div>
        <div className="list">
          {events.length ? (
            events.map((event: Event) => (
              <div key={event.id} className="list-item">
                <div style={{ flex: 1 }}>
                  <div className="list-title">
                    {event.message || `${event.type} event`}
                  </div>
                  <div className="muted" style={{ marginTop: "0.25rem" }}>
                    {event.level && (
                      <>
                        <span className={`status ${event.level}`}>
                          {event.level}
                        </span>
                        {" · "}
                      </>
                    )}
                    {new Date(event.receivedAt * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="muted">No events found for this issue.</div>
          )}
        </div>
      </div>
    </div>
  );
}
