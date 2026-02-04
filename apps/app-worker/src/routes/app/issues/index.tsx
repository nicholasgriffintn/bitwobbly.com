import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/layout";
import { ErrorCard } from "@/components/feedback";
import { IssuesModals } from "@/components/modals/issues";
import { toTitleCase } from "@/utils/format";
import {
  listSentryProjectsFn,
  getSentryProjectDsnFn,
} from "@/server/functions/sentry";
import { listComponentsFn } from "@/server/functions/components";

type SentryProject = {
  id: string;
  name: string;
  platform: string | null;
  componentId: string | null;
  sentryProjectId: number;
  createdAt: string;
};

type Component = {
  id: string;
  name: string;
};

export const Route = createFileRoute("/app/issues/")({
  component: IssueTracking,
  loader: async () => {
    const { projects } = await listSentryProjectsFn();
    const { components } = await listComponentsFn();
    return { projects, components };
  },
});

function IssueTracking() {
  const { projects: initialProjects, components: initialComponents } =
    Route.useLoaderData();

  const [projects, setProjects] = useState<SentryProject[]>(initialProjects);
  const [components] = useState<Component[]>(initialComponents);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDsnModalOpen, setIsDsnModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SentryProject | null>(
    null
  );
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null
  );
  const [dsn, setDsn] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);

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

  const showEditModal = (project: SentryProject) => {
    setEditingProject(project);
    setIsEditModalOpen(true);
  };

  const showDeleteModal = (project: SentryProject) => {
    setDeletingProjectId(project.id);
    setIsDeleteModalOpen(true);
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

  const groupProjectsByComponent = () => {
    const grouped = new Map<string, SentryProject[]>();

    for (const project of projects) {
      if (project.componentId) {
        const componentId = project.componentId;
        if (!grouped.has(componentId)) {
          grouped.set(componentId, []);
        }
        grouped.get(componentId)?.push(project);
      }
    }

    return grouped;
  };

  const renderProjectGroup = (
    groupName: string,
    projectList: SentryProject[]
  ) => {
    const component = components.find((c) => c.id === groupName);
    return (
      <div key={groupName} className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] pb-2">
          <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">
            {component?.name || "Unknown Component"}
          </span>
          <span className="pill small bg-[color:var(--surface-1)] text-[color:var(--text-secondary)]">
            {projectList.length} project{projectList.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="list">
          {projectList.map((project) => (
            <div key={project.id} className="list-item-expanded">
              <div className="list-row">
                <div className="flex-1">
                  <div className="list-title">{project.name}</div>
                  <div className="muted">
                    Project ID: {project.sentryProjectId}
                    {project.platform && (
                      <>
                        {" · "}
                        <span className="pill small">
                          {toTitleCase(project.platform)}
                        </span>
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
                    onClick={() => showEditModal(project)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="outline button-success"
                    onClick={() => showDsn(project.id)}
                  >
                    Show DSN
                  </button>
                  <button
                    type="button"
                    className="outline button-danger"
                    onClick={() => showDeleteModal(project)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const closeDsnModal = () => {
    setIsDsnModalOpen(false);
    setDsn(null);
    setPublicKey(null);
    setSecretKey(null);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setDeletingProjectId(null);
  };

  return (
    <div className="page">
      <PageHeader
        title="Issue Tracking"
        description="Error and performance tracking with SDK integration."
        className="mb-6"
      >
        <button type="button" onClick={() => setIsCreateModalOpen(true)}>
          Create Project
        </button>
      </PageHeader>

      {error ? <ErrorCard message={error} /> : null}

      <div className="card">
        <div className="card-title">Projects</div>
        {projects.length ? (
          (() => {
            const groupedProjects = groupProjectsByComponent();
            const projectsWithComponents = Array.from(
              groupedProjects.entries()
            );
            const projectsWithoutComponents = projects.filter(
              (p) => !p.componentId
            );

            return (
              <div>
                {projectsWithComponents.map(([componentId, projectList]) =>
                  renderProjectGroup(componentId, projectList)
                )}

                {projectsWithoutComponents.length > 0 && (
                  <div className="mb-6">
                    <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] pb-2">
                      <span className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">
                        No Component
                      </span>
                      <span className="pill small bg-[color:var(--surface-1)] text-[color:var(--text-secondary)]">
                        {projectsWithoutComponents.length} project
                        {projectsWithoutComponents.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="list">
                      {projectsWithoutComponents.map((project) => (
                        <div key={project.id} className="list-item-expanded">
                          <div className="list-row">
                            <div className="flex-1">
                              <div className="list-title">{project.name}</div>
                              <div className="muted">
                                Project ID: {project.sentryProjectId}
                                {project.platform && (
                                  <>
                                    {" · "}
                                    <span className="pill small">
                                      {toTitleCase(project.platform)}
                                    </span>
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
                                onClick={() => showEditModal(project)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="outline button-success"
                                onClick={() => showDsn(project.id)}
                              >
                                Show DSN
                              </button>
                              <button
                                type="button"
                                className="outline button-danger"
                                onClick={() => showDeleteModal(project)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="muted">No projects configured.</div>
        )}
      </div>

      <IssuesModals
        isCreateOpen={isCreateModalOpen}
        onCloseCreate={() => setIsCreateModalOpen(false)}
        onCreateSuccess={refreshProjects}
        onCreated={({ dsn, publicKey, secretKey }) => {
          setDsn(dsn);
          setPublicKey(publicKey);
          setSecretKey(secretKey);
          setIsDsnModalOpen(true);
        }}
        components={components}
        isEditOpen={isEditModalOpen}
        onCloseEdit={() => {
          setIsEditModalOpen(false);
          setEditingProject(null);
        }}
        onEditSuccess={refreshProjects}
        editingProject={editingProject}
        isDsnOpen={isDsnModalOpen}
        onCloseDsn={closeDsnModal}
        dsn={dsn}
        publicKey={publicKey}
        secretKey={secretKey}
        isDeleteOpen={isDeleteModalOpen}
        onCloseDelete={closeDeleteModal}
        onDeleteSuccess={refreshProjects}
        deletingProjectId={deletingProjectId}
      />
    </div>
  );
}
