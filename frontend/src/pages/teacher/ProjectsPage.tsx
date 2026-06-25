import { useTranslation } from 'react-i18next';
/**
 * ProjectsPage.tsx - Teacher Project Management
 * With Peripateticware Design System CSS
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '@/config/api';

interface Project {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade_level: string;
  duration_weeks: number;
  status: string;
  activity_count: number;
}

const ProjectsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiClient.get('/teacher/projects');
        setProjects(response.data.items ?? []);
      } catch (err) {
        setError('Failed to load projects. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const statusBadgeClass = (status: string) =>
    status === 'active' ? 'badge badge-success' : 'badge badge-outline';

  const formatStatus = (status: string) => {
    if (status === 'active') return 'Active';
    if (status === 'planning') return 'Planning';
    if (status === 'completed') return 'Completed';
    if (status === 'archived') return 'Archived';
    return status;
  };

  return (
    <div className="bg">
      <div className="container py-xl">

        {/* Header */}
        <div className="flex-between mb-3xl">
          <div>
            <h1 className="h1 mb-md">{t('landing:projectspage.projects', 'Projects')}</h1>
            <p className="text-lg text-muted">{t('landing:create_and_organize_learning_projects', 'Create and organize learning projects')}</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/teacher/projects/new')}>
            {t('landing:projectspage.new_project', '+ New Project')}
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-xl">
            <p className="text-muted">{t('landing:loading', 'Loading projects...')}</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
            <p className="text-muted">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
            <p className="text-muted">{t('landing:projectspage.empty', 'No projects yet. Create your first project.')}</p>
          </div>
        )}

        {/* Projects Grid */}
        {!loading && !error && projects.length > 0 && (
          <div className="grid grid-2 gap-lg">
            {projects.map((project) => (
              <div
                key={project.id}
                className="card card-accent animate-slideUp"
                onClick={() => navigate('/teacher/projects/' + project.id)}
                style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                }}
              >
                <div className="flex-between mb-md">
                  <h3 className="h5 m-0">{project.title}</h3>
                  <span className={statusBadgeClass(project.status)}>
                    {formatStatus(project.status)}
                  </span>
                </div>

                <p className="text-sm text-muted mb-lg">{project.description}</p>

                <div className="flex-between mb-lg">
                  <span className="text-sm">
                    <strong>{project.activity_count}</strong> {t('landing:projectspage.activities', 'activities')}
                  </span>
                  {project.subject && (
                    <span className="text-sm text-muted">{project.subject}</span>
                  )}
                </div>

                <div className="flex gap-sm">
                  <button
                    className="btn btn-secondary btn-sm flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/teacher/projects/' + project.id);
                    }}
                  >
                    {t('landing:view', 'View')}
                  </button>
                  <button className="btn btn-secondary btn-sm flex-1">
                    {t('landing:projectspage.edit', 'Edit')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{ __html: '@media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }' }} />
    </div>
  );
};

export default ProjectsPage;
