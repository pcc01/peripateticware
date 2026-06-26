// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import CourseFieldworkTracker from '../../components/teacher/CourseFieldworkTracker'

const ProfessorFieldworkPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation('landing')
  const navigate = useNavigate()

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto p-4">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 text-sm flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--primary)' }}
        >
          {t('professorFieldworkPage.back', '← Back')}
        </button>
        {id ? (
          <CourseFieldworkTracker activityId={id} />
        ) : (
          <p className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
            {t('professorFieldworkPage.no_activity_selected', 'No activity selected.')}
          </p>
        )}
      </div>
    </div>
  )
}

export default ProfessorFieldworkPage
