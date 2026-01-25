import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import {
  listSentryProjectsFn,
  createSentryProjectFn,
  getSentryProjectDsnFn,
} from "@/server/functions/sentry";

type SentryProject = {
  id: string;
  name: string;
  platform: string | null;
  sentryProjectId: number;
  createdAt: string;
};

export const Route = createFileRoute("/app/issues/")({
  component: IssueTracking,
  loader: async () => {
    const { projects } = await listSentryProjectsFn();
    return { projects };
  },
});

function IssueTracking() {
  const { projects: initialProjects } = Route.useLoaderData();

  const [projects, setProjects] = useState<SentryProject[]>(initialProjects);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDsnModalOpen, setIsDsnModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [dsn, setDsn] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);

  const createProject = useServerFn(createSentryProjectFn);
  const listProjects = useServerFn(listSentryProjectsFn);
  const getProjectDsn = useServerFn(getSentryProjectDsnFn);

  const refreshProjects = async () => {
    try {
      const res = await listProjects();
      setProjects(res.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await createProject({
        data: {
          name,
          platform: platform || undefined,
        },
      });

      setPublicKey(result.publicKey);
      setSecretKey(result.secretKey);
      setDsn(
        `https://${result.publicKey}@ingest.bitwobbly.com/api/${result.sentryProjectId}`,
      );
      setIsDsnModalOpen(true);
      await refreshProjects();
      setIsCreateModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const showDsn = async (projectId: string) => {
    setError(null);
    try {
      const result = await getProjectDsn({ data: { projectId } });
      setDsn(result.dsn);
      setPublicKey(result.key.publicKey);
      setSecretKey(result.key.secretKey || null);
      setIsDsnModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setName("");
    setPlatform("");
  };

  const closeDsnModal = () => {
    setIsDsnModalOpen(false);
    setDsn(null);
    setPublicKey(null);
    setSecretKey(null);
  };

  return (
    <div className="page">
      <div className="page-header mb-6">
        <div>
          <h2>Issue Tracking</h2>
          <p>Error and performance tracking with SDK integration.</p>
        </div>
        <button onClick={() => setIsCreateModalOpen(true)}>
          Create Project
        </button>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div className="card-title">Projects</div>
        <div className="list">
          {projects.length ? (
            projects.map((project) => (
              <div key={project.id} className="list-item-expanded">
                <div className="list-row">
                  <div style={{ flex: 1 }}>
                    <div className="list-title">{project.name}</div>
                    <div className="muted">
                      Project ID: {project.sentryProjectId}
                      {project.platform && (
                        <>
                          {" · "}
                          <span className="pill small">{project.platform}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="button-row">
                    <Link
                      to="/app/issues/$projectId"
                      params={{ projectId: project.id }}
                    >
                      <button type="button" className="outline">
                        View Issues
                      </button>
                    </Link>
                    <button
                      type="button"
                      className="outline"
                      onClick={() => showDsn(project.id)}
                    >
                      Show DSN
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="muted">No projects configured.</div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeCreateModal}
        title="Create Project"
      >
        <form className="form" onSubmit={onCreate}>
          <label htmlFor="project-name">Project Name</label>
          <input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Application"
            required
          />

          <label htmlFor="project-platform">Platform</label>
          <select
            id="project-platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="">Select platform...</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="react">React</option>
            <option value="vue">Vue</option>
            <option value="node">Node.js</option>
            <option value="python">Python</option>
            <option value="go">Go</option>
            <option value="ruby">Ruby</option>
            <option value="php">PHP</option>
            <option value="java">Java</option>
          </select>

          <div className="button-row" style={{ marginTop: "1rem" }}>
            <button type="submit">Create Project</button>
            <button
              type="button"
              className="outline"
              onClick={closeCreateModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDsnModalOpen}
        onClose={closeDsnModal}
        title="Project DSN"
      >
        <div className="form">
          <div
            style={{
              padding: "1rem",
              marginBottom: "1rem",
              backgroundColor: "#f8f9fa",
              borderRadius: "4px",
              border: "2px solid #28a745",
            }}
          >
            <div
              style={{
                marginBottom: "0.75rem",
                color: "#28a745",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "1rem",
                fontWeight: 600,
              }}
            >
              <span>✓</span>
              SDK Configuration
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                DSN
              </label>
              <input
                readOnly
                value={dsn || ""}
                onClick={(e) => e.currentTarget.select()}
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  width: "100%",
                }}
              />
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                Public Key
              </label>
              <input
                readOnly
                value={publicKey || ""}
                onClick={(e) => e.currentTarget.select()}
                style={{
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  width: "100%",
                }}
              />
            </div>

            {secretKey && (
              <div>
                <label style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  Secret Key
                </label>
                <input
                  readOnly
                  value={secretKey}
                  onClick={(e) => e.currentTarget.select()}
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    width: "100%",
                  }}
                />
              </div>
            )}
          </div>
          <div className="button-row">
            <button type="button" onClick={closeDsnModal}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
