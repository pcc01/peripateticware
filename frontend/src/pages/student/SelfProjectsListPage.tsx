// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { selfProjectApi } from '../../services/phase7Api'
import type { SelfProject } from '../../types/phase7'

const SelfProjectsListPage: React.FC = () => {
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const [projects, setProjects] = useState<SelfProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    selfProjectApi.list()
      .then(setProjects)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleNew = async () => {
    try {
      const proj = await selfProjectApi.create({ title: 'New Project', description: '' })
      navigate(`/student/self-projects/${proj.id}`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  if (loading) return <div className="p-8 text-center">{t('loading', 'Loading…')}</div>

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
          {t('my_projects', 'My Projects')}
        </h1>
        <button
          onClick={handleNew}
          className="px-4 py-2 rounded-lg text-white font-medium"
          style={{ background: 'var(--primary)' }}
        >
          + {t('new_project', 'New Project')}
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700">{error}</div>}

      {projects.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <p className="text-lg mb-4">{t('no_projects', 'No projects yet.')}</p>
          <button onClick={handleNew} className="px-6 py-2 rounded-lg text-white" style={{ background: 'var(--primary)' }}>
            {t('start_project', 'Start a project')}
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map(proj => (
            <li key={proj.id}>
              <Link
                to={`/student/self-projects/${proj.id}`}
                className="block p-4 rounded-xl border transition-shadow hover:shadow-md"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{proj.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                    {proj.status}
                  </span>
                </div>
                {proj.description && (
                  <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{proj.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SelfProjectsListPage
