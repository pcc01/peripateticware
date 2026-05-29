import { useTranslation } from 'react-i18next';
/**
 * ProjectsPage.tsx - Teacher Project Management
 * With Peripateticware Design System CSS
 */

import React, { useState } from 'react';
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
  const [projects, setProjects] = useState<Project[]>([
  {
    id: '1',
    title: 'Spring Ecology Studies',
    description: 'Comprehensive ecological field studies for spring semester',
    studentCount: 24,
    status: 'active'
  },
  {
    id: '2',
    title: 'Watershed Investigation',
    description: 'Multi-week water systems investigation project',
    studentCount: 18,
    status: 'active'
  },
  {
    id: '3',
    title: 'Fall Forest Survey',
    description: 'Seasonal forest monitoring project',
    studentCount: 22,
    status: 'archived'
  }]
  );

  return (
    <div className="bg">
      <div className="container py-xl">
        {/* Header */}
        <div className="flex-between mb-3xl">
          <div>
            <h1 className="h1 mb-md">{t("landing:projectspage.projects", "Projects")}</h1>
            <p className="text-lg text-muted">{t("landing:create_and_organize_learning_projects", "Create and organize learning projects")}</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/teacher/projects/new')}>{t("landing:projectspage.new_project", "+ New Project")}

          </button>
        </div>

        {/* Projects Grid */}
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
      </div>

      <style>{`
        @media (max-width: 768px) {
          .grid-2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>);

};

export default ProjectsPage;