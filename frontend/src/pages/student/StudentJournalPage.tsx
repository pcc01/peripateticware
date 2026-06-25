// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * StudentJournalPage
 *
 * A chronological view of the student's learning journey — field notes,
 * completed sessions, and self-project entries in one timeline.
 *
 * This is a display/aggregation page. Editing individual entries happens
 * through their own pages (/student/field-notes/:id, etc.).
 *
 * Data sources:
 *   GET /api/v1/student/field-notes   — field note entries
 *   (sessions and self-projects can be added in a future iteration)
 */

import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fieldNoteApi } from '../../services/phase7Api'
import type { FieldNoteListItem } from '../../types/phase7'
import { useTranslation } from 'react-i18next';

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:                 { bg: '#f1f5f9', text: '#64748b',  label: 'Draft' },
  complete:              { bg: '#dcfce7', text: '#15803d',  label: 'Complete' },
  archived:              { bg: '#e0f2fe', text: '#0369a1',  label: 'Archived' },
  submitted_for_review:  { bg: '#fef9c3', text: '#a16207',  label: 'In Review' },
  promoted:              { bg: '#ede9fe', text: '#7c3aed',  label: 'Promoted ✓' },
}

function fmtMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function groupByMonth(notes: FieldNoteListItem[]): [string, FieldNoteListItem[]][] {
  const map = new Map<string, FieldNoteListItem[]>()
  for (const n of notes) {
    const key = fmtMonthYear(n.created_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(n)
  }
  return Array.from(map.entries())
}

const StudentJournalPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate  = useNavigate()
  const [notes, setNotes]     = useState<FieldNoteListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState<'all' | 'complete' | 'draft'>('all')

  useEffect(() => {
    fieldNoteApi.list({ page: 1 })
      .then(r => setNotes(r.items))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleNew = async () => {
    try {
      const note = await fieldNoteApi.create({ title: 'New journal entry' })
      navigate(`/student/field-notes/${note.id}`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const filtered = filter === 'all'
    ? notes
    : notes.filter(n => (n.status as string) === filter || (filter === 'complete' && (n.status as string) === 'completed'))

  const groups = groupByMonth(filtered)
  const totalComplete = notes.filter(n => (n.status as string) === 'completed').length

  if (loading) return (
    <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  )

  return (
    <div className="max-w-2xl mx-auto p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{t('pages_student_studentjournalpage.my_journal', 'My Journal')}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {notes.length} {notes.length === 1 ? 'entry' : 'entries'} · {totalComplete} complete
          </p>
        </div>
        <button
          onClick={handleNew}
          className="px-4 py-2 rounded-lg text-white font-medium text-sm"
          style={{ background: 'var(--primary)' }}
        >
          + New Entry
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm">{error}</div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'complete', 'draft'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-sm font-medium capitalize transition"
            style={{
              background: filter === f ? 'var(--primary)' : 'var(--surface)',
              color: filter === f ? 'white' : 'var(--text-muted)',
              border: `1px solid ${filter === f ? 'var(--primary)' : 'var(--border)'}`,
            }}
          >
            {f === 'all' ? `All (${notes.length})` : f === 'complete' ? `Complete (${notes.filter(n=>(n.status as string)==='complete').length})` : `Draft (${notes.filter(n=>(n.status as string)==='draft').length})`}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <div className="text-5xl mb-4">📔</div>
          <p className="text-lg font-medium mb-2">
            {filter === 'all' ? 'No journal entries yet' : `No ${filter} entries`}
          </p>
          <p className="text-sm mb-6 max-w-sm mx-auto">
            {filter === 'all'
              ? 'Use your journal to record observations, reflections, and discoveries from your learning activities.'
              : 'Change the filter above to see other entries.'}
          </p>
          {filter === 'all' && (
            <button
              onClick={handleNew}
              className="px-6 py-2 rounded-lg text-white font-medium"
              style={{ background: 'var(--primary)' }}
            >
              Write your first entry
            </button>
          )}
        </div>
      )}

      {/* Timeline grouped by month */}
      {groups.map(([month, items]) => (
        <div key={month} className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
            {month}
          </div>
          <div className="space-y-2">
            {items.map(note => {
              const s = STATUS_STYLE[note.status] ?? STATUS_STYLE.draft
              return (
                <Link
                  key={note.id}
                  to={`/student/field-notes/${note.id}`}
                  className="block p-4 rounded-xl border transition hover:shadow-md"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', textDecoration: 'none' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>
                        {note.title || 'Untitled entry'}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {fmtDay(note.created_at)}
                        </span>
                        {note.location_name && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            📍 {note.location_name}
                          </span>
                        )}
                        {note.capture_count > 0 && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            📎 {note.capture_count}
                          </span>
                        )}
                      </div>
                      {note.description && (
                        <p className="text-sm mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
                          {note.description}
                        </p>
                      )}
                    </div>
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                      style={{ background: s.bg, color: s.text }}
                    >
                      {s.label}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      ))}

      {/* Footer tip */}
      {notes.length > 0 && (
        <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
          Entries are created from your field notes. <Link to="/student/field-notes" style={{ color: 'var(--primary)' }}>Go to Field Notes →</Link>
        </p>
      )}

    </div>
  )
}

export default StudentJournalPage
