import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { PlatformSelect } from '@/components/PlatformSelect';
import { CopyButton } from '@/components/CopyButton';
import {
  listSentryProjectsFn,
  createSentryProjectFn,
  getSentryProjectDsnFn,
  updateSentryProjectFn,
  deleteSentryProjectFn,
} from '@/server/functions/sentry';
import { listComponentsFn } from '@/server/functions/components';

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
  const [selectedComponentId, setSelectedComponentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDsnModalOpen, setIsDsnModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null,
  );
  const [dsn, setDsn] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const createProject = useServerFn(createSentryProjectFn);
  const updateProject = useServerFn(updateSentryProjectFn);
  const deleteProject = useServerFn(deleteSentryProjectFn);
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
    setIsLoading(true);
    try {
      const result = await createProject({
        data: {
          name,
          platform: platform || undefined,
          componentId: selectedComponentId || undefined,
        },
      });

      setPublicKey(result.publicKey);
      setSecretKey(result.secretKey);
      setDsn(
        `https://${result.publicKey}@ingest.bitwobbly.com/${result.sentryProjectId}`,
      );
      setIsDsnModalOpen(true);
      await refreshProjects();
      setIsCreateModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const showEditModal = (project: SentryProject) => {
    setEditingProjectId(project.id);
    setName(project.name);
    setPlatform(project.platform || "");
    setSelectedComponentId(project.componentId || "");
    setIsEditModalOpen(true);
  };

  const onEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingProjectId) return;
    setError(null);
    setIsLoading(true);
    try {
      await updateProject({
        data: {
          projectId: editingProjectId,
          name,
          platform: platform || null,
          componentId: selectedComponentId || null,
        },
      });
      await refreshProjects();
      setIsEditModalOpen(false);
      setEditingProjectId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const showDeleteModal = (project: SentryProject) => {
    setDeletingProjectId(project.id);
    setIsDeleteModalOpen(true);
  };

  const onDelete = async () => {
    if (!deletingProjectId) return;
    setError(null);
    setIsLoading(true);
    try {
      await deleteProject({ data: { projectId: deletingProjectId } });
      await refreshProjects();
      setIsDeleteModalOpen(false);
      setDeletingProjectId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
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

  const renderProjectGroup = (groupName: string, projectList: SentryProject[]) => {
    const component = components.find(c => c.id === groupName);
    return (
      <div key={groupName} style={{ marginBottom: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          marginBottom: '0.75rem',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid var(--border)'
        }}>
          <span style={{ 
            fontWeight: '600', 
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            {component?.name || 'Unknown Component'}
          </span>
          <span className="pill small" style={{ 
            backgroundColor: 'var(--surface-1)',
            color: 'var(--text-secondary)'
          }}>
            {projectList.length} project{projectList.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="list">
          {projectList.map((project) => (
            <div key={project.id} className="list-item-expanded">
              <div className="list-row">
                <div style={{ flex: 1 }}>
                  <div className="list-title">{project.name}</div>
                  <div className="muted">
                    Project ID: {project.sentryProjectId}
                    {project.platform && (
                      <>
                        {' · '}
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
                    onClick={() => showEditModal(project)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="outline"
                    onClick={() => showDsn(project.id)}
                  >
                    Show DSN
                  </button>
                  <button
                    type="button"
                    className="outline"
                    onClick={() => showDeleteModal(project)}
                    style={{ color: '#dc3545' }}
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

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    setName("");
    setPlatform("");
    setSelectedComponentId("");
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingProjectId(null);
    setName("");
    setPlatform("");
    setSelectedComponentId("");
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
      <div className="page-header mb-6">
        <div>
          <h2>Issue Tracking</h2>
          <p>Error and performance tracking with SDK integration.</p>
        </div>
        <button type="button" onClick={() => setIsCreateModalOpen(true)}>
          Create Project
        </button>
      </div>

      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <div className="card-title">Projects</div>
        {projects.length ? (() => {
          const groupedProjects = groupProjectsByComponent();
          const projectsWithComponents = Array.from(groupedProjects.entries());
          const projectsWithoutComponents = projects.filter(p => !p.componentId);
          
          return (
            <div>
              {/* Projects grouped by component */}
              {projectsWithComponents.map(([componentId, projectList]) => 
                renderProjectGroup(componentId, projectList)
              )}
              
              {/* Projects without components */}
              {projectsWithoutComponents.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    <span style={{ 
                      fontWeight: '600', 
                      color: 'var(--text-secondary)',
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      No Component
                    </span>
                    <span className="pill small" style={{ 
                      backgroundColor: 'var(--surface-1)',
                      color: 'var(--text-secondary)'
                    }}>
                      {projectsWithoutComponents.length} project{projectsWithoutComponents.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="list">
                    {projectsWithoutComponents.map((project) => (
                      <div key={project.id} className="list-item-expanded">
                        <div className="list-row">
                          <div style={{ flex: 1 }}>
                            <div className="list-title">{project.name}</div>
                            <div className="muted">
                              Project ID: {project.sentryProjectId}
                              {project.platform && (
                                <>
                                  {' · '}
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
                              onClick={() => showEditModal(project)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="outline"
                              onClick={() => showDsn(project.id)}
                            >
                              Show DSN
                            </button>
                            <button
                              type="button"
                              className="outline"
                              onClick={() => showDeleteModal(project)}
                              style={{ color: '#dc3545' }}
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
        })() : (
          <div className="muted">No projects configured.</div>
        )}
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
            disabled={isLoading}
          />

          <label htmlFor="project-platform">Platform</label>
          <PlatformSelect
            id="project-platform"
            value={platform}
            onChange={setPlatform}
          />

          {components.length > 0 && (
            <>
              <label htmlFor="project-component" style={{ marginTop: '1rem' }}>
                Linked component (optional)
              </label>
              <select
                id="project-component"
                value={selectedComponentId}
                onChange={(e) => setSelectedComponentId(e.target.value)}
                disabled={isLoading}
                style={{ marginTop: '0.5rem' }}
              >
                <option value="">No component</option>
                {components.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="button-row" style={{ marginTop: '1rem' }}>
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Project'}
            </button>
            <button
              type="button"
              className="outline"
              onClick={closeCreateModal}
              disabled={isLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        title="Edit Project"
      >
        <form className="form" onSubmit={onEdit}>
          <label htmlFor="edit-project-name">Project Name</label>
          <input
            id="edit-project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Application"
            required
            disabled={isLoading}
          />

          <label htmlFor="edit-project-platform">Platform</label>
          <PlatformSelect
            id="edit-project-platform"
            value={platform}
            onChange={setPlatform}
          />

          {components.length > 0 && (
            <>
              <label htmlFor="edit-project-component" style={{ marginTop: '1rem' }}>
                Linked component (optional)
              </label>
              <select
                id="edit-project-component"
                value={selectedComponentId}
                onChange={(e) => setSelectedComponentId(e.target.value)}
                disabled={isLoading}
                style={{ marginTop: '0.5rem' }}
              >
                <option value="">No component</option>
                {components.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="button-row" style={{ marginTop: '1rem' }}>
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              className="outline"
              onClick={closeEditModal}
              disabled={isLoading}
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
          <div className="dsn-config">
            <div className="dsn-config-header">
              <span>✓</span>
              SDK Configuration
            </div>

            <div className="dsn-field">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <label>DSN</label>
                <CopyButton text={dsn || ''} />
              </div>
              <input
                readOnly
                value={dsn || ''}
                onClick={(e) => e.currentTarget.select()}
                className="dsn-input"
              />
            </div>

            <div className="dsn-field">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <label>Public Key</label>
                <CopyButton text={publicKey || ''} />
              </div>
              <input
                readOnly
                value={publicKey || ''}
                onClick={(e) => e.currentTarget.select()}
                className="dsn-input"
              />
            </div>

            {secretKey && (
              <div className="dsn-field">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <label>Secret Key</label>
                  <CopyButton text={secretKey} />
                </div>
                <input
                  readOnly
                  value={secretKey}
                  onClick={(e) => e.currentTarget.select()}
                  className="dsn-input"
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

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        title="Delete Project"
      >
        <div className="form">
          <p>
            Are you sure you want to delete this project? This will permanently
            delete all associated issues, events, and keys. This action cannot
            be undone.
          </p>
          <div className="button-row" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              onClick={onDelete}
              disabled={isLoading}
              style={{ backgroundColor: '#dc3545' }}
            >
              {isLoading ? 'Deleting...' : 'Delete Project'}
            </button>
            <button
              type="button"
              className="outline"
              onClick={closeDeleteModal}
              disabled={isLoading}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
