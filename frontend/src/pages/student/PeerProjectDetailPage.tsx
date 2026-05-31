// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { peerProjectApi } from '../../services/phase7Api'
import type { PeerProject, PeerProjectResponse } from '../../types/phase7'

const PeerProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const [project, setProject] = useState<PeerProject | null>(null)
  const [response, setResponse] = useState<PeerProjectResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      peerProjectApi.get(id).then(setProject),
      peerProjectApi.getMyResponse(id).then(setResponse).catch(() => null),
    ])
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const handleStartResponse = async () => {
    if (!id) return
    setSubmitting(true)
    try {
      const r = await peerProjectApi.startResponse(id)
      setResponse(r)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitResponse = async () => {
    if (!id) return
    setSubmitting(true)
    try {
      await peerProjectApi.completeResponse(id)
      const r = await peerProjectApi.getMyResponse(id)
      setResponse(r)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-8 text-center">{t('loading', 'Loading…')}</div>
  if (!project) return <div className="p-8 text-center">{t('not_found', 'Project not found.')}</div>

  return (
    <div className="max-w-2xl mx-auto p-6">
      <button
        onClick={() => navigate('/student/peer-projects')}
        className="text-sm mb-4 flex items-center gap-1"
        style={{ color: 'var(--text-muted)' }}
      >
        ← {t('back', 'Back')}
      </button>

      <div className="rounded-xl border p-6 mb-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between mb-3">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{project.title}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
            {project.status}
          </span>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{project.description}</p>

        {project.guiding_prompts?.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>{t('guiding_prompts', 'Guiding Prompts')}</h3>
            <ul className="space-y-1">
              {project.guiding_prompts.map((p, i) => (
                <li key={i} className="text-sm" style={{ color: 'var(--text-muted)' }}>• {p.text}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700">{error}</div>}

      {/* Response section */}
      <div className="rounded-xl border p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>{t('your_response', 'Your Response')}</h2>

        {!response ? (
          <button
            onClick={handleStartResponse}
            disabled={submitting}
            className="w-full py-3 rounded-lg text-white font-medium disabled:opacity-50"
            style={{ background: 'var(--primary)' }}
          >
            {submitting ? t('starting', 'Starting…') : t('start_response', 'Start Response')}
          </button>
        ) : response.status === 'submitted' || response.status === 'reviewed' ? (
          <div className="text-center py-4" style={{ color: 'var(--primary)' }}>
            ✓ {t('response_submitted', 'Response submitted')}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('response_in_progress', 'Response in progress. Add captures then submit.')}
            </p>
            <button
              onClick={handleSubmitResponse}
              disabled={submitting}
              className="w-full py-3 rounded-lg text-white font-medium disabled:opacity-50"
              style={{ background: 'var(--primary)' }}
            >
              {submitting ? t('submitting', 'Submitting…') : t('submit_response', 'Submit Response')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default PeerProjectDetailPage
