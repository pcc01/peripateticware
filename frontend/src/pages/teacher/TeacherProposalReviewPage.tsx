// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react'
import { proposalApi } from '../../services/phase7Api'
import type { Proposal } from '../../types/phase7'
import { useTranslation } from 'react-i18next';

const TeacherProposalReviewPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  // Per-card state
  const [feedbackMap, setFeedbackMap]   = useState<Record<string, string>>({})
  const [actioningId, setActioningId]   = useState<string | null>(null)
  const [expanded, setExpanded]         = useState<string | null>(null)

  useEffect(() => {
    proposalApi.listPending()
      .then(setProposals)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleApprove = async (id: string) => {
    setActioningId(id)
    try {
      await proposalApi.approve(id)
      setProposals(ps => ps.filter(p => p.id !== id))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActioningId(null)
    }
  }

  const handleReject = async (id: string) => {
    const feedback = feedbackMap[id]?.trim()
    if (!feedback) {
      setError('Please add feedback before rejecting so the student knows what to fix.')
      setExpanded(id)
      return
    }
    setActioningId(id)
    setError(null)
    try {
      await proposalApi.reject(id, feedback)
      setProposals(ps => ps.filter(p => p.id !== id))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActioningId(null)
    }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>{t('pages_teacher_teacherproposalreviewpage.student_challenge_proposals', 'Student Challenge Proposals')}</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{t('pages_teacher_teacherproposalreviewpage.review_studentcreated_reverse_scavenger_', 'Review student-created reverse scavenger hunts. Approved proposals become live activities.')}</p>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm">{error}</div>
      )}

      {proposals.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <div className="text-5xl mb-4">✅</div>
          <p className="text-lg font-medium">{t('pages_teacher_teacherproposalreviewpage.all_caught_up', 'All caught up!')}</p>
          <p className="text-sm mt-1">{t('pages_teacher_teacherproposalreviewpage.no_proposals_waiting_for_review', 'No proposals waiting for review.')}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {proposals.map(p => {
            const isExpanded = expanded === p.id
            const actioning  = actioningId === p.id

            return (
              <li
                key={p.id}
                className="rounded-xl border overflow-hidden"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                {/* Header */}
                <button
                  className="w-full text-left px-5 py-4 flex items-start justify-between gap-3"
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ color: 'var(--text)' }}>{p.title}</p>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      by {p.student_name || 'Student'} · {p.subject}
                      {p.location_hint ? ` · ${p.location_hint}` : ''}
                    </p>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--border)' }}>
                    {/* Challenge description */}
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide mb-1"
                         style={{ color: 'var(--text-muted)' }}>{t('pages_teacher_teacherproposalreviewpage.challenge', 'Challenge')}</p>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                        {p.challenge_description}
                      </p>
                    </div>

                    {/* Location hint */}
                    {p.location_hint && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1"
                           style={{ color: 'var(--text-muted)' }}>{t('pages_teacher_teacherproposalreviewpage.location_hint', 'Location Hint')}</p>
                        <p className="text-sm" style={{ color: 'var(--text)' }}>{p.location_hint}</p>
                      </div>
                    )}

                    {/* Note to teacher */}
                    {p.note_to_teacher && (
                      <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1 text-blue-600">{t('pages_teacher_teacherproposalreviewpage.students_note_to_you', 'Student\'s note to you')}</p>
                        <p className="text-sm text-blue-800">{p.note_to_teacher}</p>
                      </div>
                    )}

                    {/* Feedback field */}
                    <div className="mt-4">
                      <label className="block text-xs font-semibold uppercase tracking-wide mb-1"
                             style={{ color: 'var(--text-muted)' }}>{t('pages_teacher_teacherproposalreviewpage.feedback_for_student_required_if_rejecti', 'Feedback for student (required if rejecting)')}</label>
                      <textarea
                        rows={2}
                        value={feedbackMap[p.id] ?? ''}
                        onChange={e => setFeedbackMap(m => ({ ...m, [p.id]: e.target.value }))}
                        placeholder="Optional for approval, required for rejection…"
                        className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
                        style={{
                          background: 'var(--background)',
                          borderColor: 'var(--border)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={() => handleApprove(p.id)}
                        disabled={actioning}
                        className="px-5 py-2 rounded-lg text-white text-sm font-medium"
                        style={{ background: actioning ? '#aaa' : 'var(--primary)' }}
                      >
                        {actioning ? 'Approving…' : '✓ Approve & Publish'}
                      </button>
                      <button
                        onClick={() => handleReject(p.id)}
                        disabled={actioning}
                        className="px-4 py-2 rounded-lg text-sm font-medium border text-red-600 hover:bg-red-50"
                        style={{ borderColor: '#fca5a5' }}
                      >
                        {actioning ? 'Sending…' : 'Return for Revision'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default TeacherProposalReviewPage
