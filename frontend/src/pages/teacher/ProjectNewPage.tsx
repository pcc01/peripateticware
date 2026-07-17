import { useTranslation } from 'react-i18next';
/**
 * ProjectNewPage.tsx - Create a new Teacher Project
 * With Peripateticware Design System CSS
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import ProjectBuilder from '@/components/teacher/ProjectBuilder';
import type { Project } from '@/types/teacher';

const ProjectNewPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  const handleSave = (project: Project) => {
    navigate(`/teacher/projects/${project.id}`);
  };

  const handleCancel = () => {
    navigate('/teacher/projects');
  };

  return (
    <div className="bg">
      <div className="container py-xl">
        <div className="mb-3xl">
          <button className="btn btn-text" onClick={handleCancel}>
            {t('landing:back_to_projects', '← Back to Projects')}
          </button>
          <h1 className="h1 mt-md">{t('landing:projectnewpage.new_project', 'New Project')}</h1>
          <p className="text-lg text-muted">
            {t('landing:projectnewpage.subtitle', 'Set up a new learning project for your students.')}
          </p>
        </div>

        <div className="card" style={{ maxWidth: '720px' }}>
          <ProjectBuilder onSave={handleSave} onCancel={handleCancel} />
        </div>
      </div>
    </div>
  );
};

export default ProjectNewPage;
