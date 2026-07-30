// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTeacherStore } from '@/stores/teacher'
import ProjectLiveTracker from '@/components/teacher/ProjectLiveTracker'

const ProjectLiveTrackingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const { selectedProject: project, fetchProject } = useTeacherStore()

  useEffect(() => {
    if (id) fetchProject(id)
  }, [id, fetchProject])

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto p-4">
        <button
          onClick={() => navigate(`/teacher/projects/${id}`)}
          className="mb-4 text-sm flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--primary)' }}
        >
          {t('projectLiveTrackingPage.back', '← Back to Project')}
        </button>

        <div className="mb-4">
          <h1 className="h3 m-0">
            {t('projectLiveTrackingPage.title', 'Live Tracking')}
          </h1>
          {project?.title && (
            <p className="text-sm text-muted m-0">{project.title}</p>
          )}
        </div>

        {id ? (
          <ProjectLiveTracker projectId={id} />
        ) : (
          <p className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
            {t('projectLiveTrackingPage.no_project_selected', 'No project selected.')}
          </p>
        )}
      </div>
    </div>
  )
}

export default ProjectLiveTrackingPage
