import { useTranslation } from 'react-i18next';
/**
 * ProjectsPage.tsx - Teacher Project Management
 * ✅ MERGED: Original Peripateticware Design System + Phase 1 API Fetching
 *
 * Features:
 * - Beautiful project cards with hover effects and animations
 * - Fetches real data from GET /api/v1/teacher/projects
 * - Loading and error states
 * - Status badges (Active/Archived)
 * - Create new project button
 * - Responsive grid layout
 * - Empty state with helpful message
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Project {
  id: string;
  title: string;
  description: string;
  studentCount: number;
  status: 'active' | 'archived';
}

const ProjectsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ========================================================================
  // FETCH PROJECTS FROM API
  // ========================================================================
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/teacher/projects', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch projects (${response.status})`);
        }

        const data = await response.json();

        // Transform API response to match Project interface
        const transformedProjects = Array.isArray(data) ? data.map((item: any) => ({
          id: item.id,
          title: item.title,
          description: item.description || '',
          studentCount: item.student_count || 0,
          status: item.status || 'active'
        })) : [];

        setProjects(transformedProjects);
      } catch (err: any) {
        console.error('Error fetching projects:', err);
        setError(err.message || 'Failed to load projects');
        setProjects([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // ========================================================================
  // LOADING STATE
  // ========================================================================
  if (loading) {
    return (
      <div className="bg">
        <div className="container py-xl">
          <div style={{ textAlign: 'center', padding: 'var(--space-3xl) 0' }}>
            <div style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid var(--color-primary-muted)',
              borderTop: '4px solid var(--color-primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p className="text-muted" style={{ marginTop: 'var(--space-lg)' }}>{t("landing:loading_your_projects", "Loading your projects...")}

            </p>
          </div>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>);

  }

  // ========================================================================
  // ERROR STATE
  // ========================================================================
  if (error) {
    return (
      <div className="bg">
        <div className="container py-xl">
          <div className="card" style={{ borderLeft: '4px solid var(--color-error)' }}>
            <p className="text-error">⚠️ {error}</p>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
              style={{ marginTop: 'var(--space-lg)' }}>{t("landing:retry", "Retry")}


            </button>
          </div>
        </div>
      </div>);

  }

  // ========================================================================
  // RENDER PAGE
  // ========================================================================
  return (
    <div className="bg">
      <div className="container py-xl">
        {/* Header */}
        <div className="flex-between mb-3xl">
          <div>
            <h1 className="h1 mb-md">{t("landing:projectspage.projects", "Projects")}</h1>
            <p className="text-lg text-muted">{t("landing:create_and_organize_learning_projects", "Create and organize learning projects")}</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/teacher/activities/new')}>{t("landing:projectspage.new_project", "+ New Project")}

          </button>
        </div>

        {/* Projects Grid */}
        {projects.length === 0 ?
        // Empty State
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}>
            <p className="h5 text-muted mb-md">{t("landing:no_projects_yet", "No projects yet")}</p>
            <p className="text-muted mb-xl">{t("landing:create_your_first_project_to_get_started", "Create your first project to get started with outdoor learning activities.")}

          </p>
            <button className="btn btn-primary" onClick={() => navigate('/teacher/activities/new')}>{t("landing:create_first_project", "+ Create First Project")}

          </button>
          </div> :

        <div className="grid grid-2 gap-lg">
            {projects.map((project) =>
          <div
            key={project.id}
            className="card card-accent animate-slideUp"
            onClick={() => navigate(`/teacher/projects/${project.id}`)}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'var(--shadow-card)';
            }}>
            
                <div className="flex-between mb-md">
                  <h3 className="h5 m-0">{project.title}</h3>
                  <span className={`badge ${project.status === 'active' ? 'badge-success' : 'badge-outline'}`}>
                    {project.status === 'active' ? 'Active' : 'Archived'}
                  </span>
                </div>

                <p className="text-sm text-muted mb-lg">{project.description}</p>

                <div className="flex-between mb-lg">
                  <span className="text-sm">
                    <strong>{project.studentCount}</strong>{t("landing:projectspage.students", "students")}
              </span>
                </div>

                <div className="flex gap-sm">
                  <button
                className="btn btn-secondary btn-sm flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/teacher/projects/${project.id}`);
                }}>{t("landing:view", "View")}


              </button>
                  <button className="btn btn-secondary btn-sm flex-1">{t("landing:projectspage.edit", "Edit")}</button>
                </div>
              </div>
          )}
          </div>
        }
      </div>

      <style>{`
        @media (max-width: 768px) {
          .grid-2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>);

};

export default ProjectsPage;