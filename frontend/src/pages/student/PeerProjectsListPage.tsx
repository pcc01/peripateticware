// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { peerProjectApi } from '../../services/phase7Api'
import type { PeerProject, PaginatedPeerProjects } from '../../types/phase7'

type Tab = 'authored' | 'available'

const PeerProjectsListPage: React.FC = () => {
  const { t } = useTranslation('landing')
  const [tab, setTab] = useState<Tab>('authored')
  const [authored, setAuthored] = useState<PeerProject[]>([])
  const [available, setAvailable] = useState<PeerProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const fetch = tab === 'authored'
      ? peerProjectApi.listAuthored().then(d => setAuthored((d as PaginatedPeerProjects).items ?? []))
      : peerProjectApi.listAvailable().then(d => setAvailable((d as PaginatedPeerProjects).items ?? []))
    fetch
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [tab])

  const projects = tab === 'authored' ? authored : available

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text)' }}>
        {t('peer_projects', 'Peer Projects')}
      </h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['authored', 'available'] as Tab[]).map(tabId => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: tab === tabId ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === tabId ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            {tabId === 'authored' ? t('my_projects', 'My Projects') : t('available_to_respond', 'Available to Respond')}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>{t('loading', 'Loading…')}</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
          {tab === 'authored'
            ? t('no_peer_projects', 'You haven\'t created any peer projects yet.')
            : t('no_available_projects', 'No peer projects available to respond to right now.')}
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map(proj => (
            <li key={proj.id}>
              <Link
                to={`/student/peer-projects/${proj.id}`}
                className="block p-4 rounded-xl border transition-shadow hover:shadow-md"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{proj.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                    {proj.status}
                  </span>
                </div>
                <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                  {proj.description}
                </p>
                {tab === 'available' && (
                  <span className="text-xs mt-2 block" style={{ color: 'var(--text-faint)' }}>
                    {proj.response_count} {t('responses', 'responses')}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default PeerProjectsListPage
