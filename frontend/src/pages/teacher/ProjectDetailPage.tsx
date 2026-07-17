import { useTranslation } from 'react-i18next';
/**
 * ProjectDetailPage.tsx - Project Details & Management
 * With Peripateticware Design System CSS
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTeacherStore } from '@/stores/teacher';
import ProjectBuilder from '@/components/teacher/ProjectBuilder';
import { getErrorMessage } from '@/utils/errorMessage';

const ProjectDetailPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { selectedProject: project, projectLoading, projectError, fetchProject } = useTeacherStore();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProject(id);
    }
  }, [id, fetchProject]);

  const formatStatus = (status: string) => {
    if (status === 'active') return t('landing:active', 'Active');
    if (status === 'planning') return t('landing:projectdetailpage.planning', 'Planning');
    if (status === 'completed') return t('landing:projectdetailpage.completed', 'Completed');
    if (status === 'archived') return t('landing:projectdetailpage.archived', 'Archived');
    return status;
  };

  // Loading state
  if (projectLoading) {
    return (
      <div className="bg">
        <div className="container py-xl">
          <div className="text-center py-xl">
            <p className="text-muted">{t('landing:loading', 'Loading project...')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Error / not found state — never render a raw error object as a child.
  if (projectError || !project) {
    return (
      <div className="bg">
        <div className="container py-xl">
          <button className="btn btn-text" onClick={() => navigate('/teacher/projects')}>
            {t('landing:back_to_projects', '← Back to Projects')}
          </button>
          <div className="card mt-lg" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
            <p className="text-muted">{getErrorMessage(projectError, t('landing:projectdetailpage.not_found', 'Project not found.'))}</p>
          </div>
        </div>
      </div>
    );
  }

  // Edit mode — reuse ProjectBuilder with the loaded project.
  if (editing) {
    return (
      <div className="bg">
        <div className="container py-xl">
          <div className="mb-3xl">
            <button className="btn btn-text" onClick={() => setEditing(false)}>
              {t('landing:projectdetailpage.back', 'Back')}
            </button>
            <h1 className="h1 mt-md">{t('landing:edit_project', 'Edit Project')}</h1>
          </div>
          <div className="card" style={{ maxWidth: '720px' }}>
            <ProjectBuilder
              project={project}
              onSave={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </div>
        </div>
      </div>
    );
  }

  const statusBadgeClass = project.status === 'active' ? 'badge badge-success' : 'badge badge-outline';
  const activities = project.activities ?? [];

  return (
    <div className="bg">
      <div className="container py-xl">
        {/* Header */}
        <div className="flex-between mb-3xl">
          <div>
            <button className="btn btn-text" onClick={() => navigate('/teacher/projects')}>
              {t('landing:back_to_projects', '← Back to Projects')}
            </button>
            <h1 className="h1 mt-md">{project.title}</h1>
            <p className="text-lg text-muted">{project.description}</p>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing(true)}>
            {t('landing:edit_project', 'Edit Project')}
          </button>
        </div>

        {/* Project Overview */}
        <div className="grid grid-3 gap-lg mb-3xl">
          <div className="card">
            <h3 className="h6 mb-md">{t('landing:subject', 'Subject')}</h3>
            <p className="h3 m-0">{project.subject}</p>
          </div>
          <div className="card">
            <h3 className="h6 mb-md">{t('landing:projectdetailpage.activities', 'Activities')}</h3>
            <p className="h3 m-0">{activities.length}</p>
          </div>
          <div className="card">
            <h3 className="h6 mb-md">{t('landing:projectdetailpage.status', 'Status')}</h3>
            <p className="m-0">
              <span className={statusBadgeClass}>{formatStatus(project.status)}</span>
            </p>
          </div>
        </div>

        {/* Project Content */}
        <div className="grid grid-3 gap-lg mb-3xl">
          <div className="card col-span-2">
            <h2 className="h4 mb-lg">{t('landing:project_description', 'Project Description')}</h2>
            <p className="text-base mb-md">{project.description}</p>
            <p className="text-base text-muted">
              {t('landing:duration_weeks', 'Duration (weeks)')}: {project.duration_weeks} | {t('landing:projectbuilder.grade', 'Grade')} {project.grade_level}
              {project.start_date && (
                <>
                  {' | '}
                  {new Date(project.start_date).toLocaleDateString()}
                  {project.end_date ? ` – ${new Date(project.end_date).toLocaleDateString()}` : ''}
                </>
              )}
            </p>
          </div>

          <div className="card">
            <h3 className="h5 mb-lg">{t('landing:quick_actions', 'Quick Actions')}</h3>
            <div className="flex-col gap-sm">
              <button className="btn btn-secondary btn-block" onClick={() => navigate('/teacher/activities')}>
                {t('landing:view_activities', 'View Activities')}
              </button>
            </div>
          </div>
        </div>

        {/* Activities */}
        <div className="card mb-3xl">
          <h2 className="h4 mb-xl">{t('landing:projectdetailpage.project_activities', 'Project Activities')}</h2>
          {activities.length === 0 ? (
            <p className="text-muted">{t('landing:projectdetailpage.no_activities', 'No activities linked to this project yet.')}</p>
          ) : (
            <div className="flex-col gap-md">
              {activities.map((activity) => (
                <div key={activity.id} className="border-bottom" style={{ paddingBottom: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
                  <div className="flex-between mb-md">
                    <h3 className="h5 m-0">{activity.title}</h3>
                    <span className={activity.status === 'published' ? 'badge badge-success' : 'badge badge-outline'}>
                      {activity.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted m-0">
                    {activity.subject} · {t('landing:projectbuilder.grade', 'Grade')} {activity.grade_level}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-lg" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/teacher/projects')}>
            {t('landing:projectdetailpage.back', 'Back')}
          </button>
        </div>
      </div>

      <style>{`
        .flex-col { display: flex; flex-direction: column; }
        .col-span-2 { grid-column: span 2; }
        .border-bottom { border-bottom: 1px solid var(--border); }
      `}</style>
    </div>
  );
};

export default ProjectDetailPage;
