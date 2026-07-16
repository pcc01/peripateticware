// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { proposalApi } from '../../services/phase7Api'
import type { Proposal } from '../../types/phase7'
import { useTranslation } from 'react-i18next';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft:    { bg: 'bg-gray-100',   text: 'text-gray-600',  label: 'Draft' },
  pending:  { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Awaiting Review' },
  approved: { bg: 'bg-green-100',  text: 'text-green-700', label: 'Approved ✓' },
  rejected: { bg: 'bg-red-100',    text: 'text-red-700',   label: 'Needs Revision' },
}

const ProposalsListPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    proposalApi.list()
      .then(setProposals)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleNew = async () => {
    try {
      const result = await proposalApi.create({
        title: 'New Challenge',
        challenge_description: '',
        location_hint: '',
        subject: 'General',
      })
      navigate(`/student/proposals/${result.id}`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>{t('pages_student_proposalslistpage.loading', 'Loading…')}</div>

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{t('pages_student_proposalslistpage.my_challenges', 'My Challenges')}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{t('pages_student_proposalslistpage.challenge_other_students_to_find_or_inte', 'Challenge other students to find or interact with a real place.')}</p>
        </div>
        <button
          onClick={handleNew}
          className="px-4 py-2 rounded-lg text-white font-medium"
          style={{ background: 'var(--primary)' }}
        >{t('pages_student_proposalslistpage.new_challenge', '+ New Challenge')}</button>
      </div>

      {error && (
        <div className="my-4 p-3 rounded bg-red-100 text-red-700 text-sm">{error}</div>
      )}

      {proposals.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <div className="text-5xl mb-4">🗺️</div>
          <p className="text-lg mb-2 font-medium">{t('pages_student_proposalslistpage.no_challenges_yet', 'No challenges yet')}</p>
          <p className="text-sm mb-6">{t('pages_student_proposalslistpage.create_a_reverse_scavenger_hunt_challeng', 'Create a reverse scavenger hunt — challenge classmates to find a stream, spot a plant, or visit a place.')}</p>
          <button
            onClick={handleNew}
            className="px-6 py-2 rounded-lg text-white font-medium"
            style={{ background: 'var(--primary)' }}
          >{t('pages_student_proposalslistpage.create_your_first_challenge', 'Create your first challenge')}</button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {proposals.map(p => {
            const s = STATUS_STYLES[p.status] ?? STATUS_STYLES.draft
            return (
              <li key={p.id}>
                <Link
                  to={`/student/proposals/${p.id}`}
                  className="block p-4 rounded-xl border transition hover:shadow-md"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>
                        {p.title}
                      </p>
                      <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        {p.subject} {p.location_hint ? `· ${p.location_hint}` : ''}
                      </p>
                      {p.status === 'rejected' && p.teacher_feedback && (
                        <p className="text-xs mt-1 text-red-600 truncate">
                          Teacher: {p.teacher_feedback}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${s.bg} ${s.text}`}>
                      {s.label}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default ProposalsListPage
