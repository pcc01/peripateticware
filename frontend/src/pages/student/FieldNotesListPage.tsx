import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fieldNoteApi } from '../../services/phase7Api'
import type { FieldNoteListItem } from '../../types/phase7'

const FieldNotesListPage: React.FC = () => {
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const [notes, setNotes] = useState<FieldNoteListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fieldNoteApi.list()
      .then((data: any) => setNotes(Array.isArray(data) ? data : (data?.items ?? [])))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleNew = async () => {
    try {
      const note = await fieldNoteApi.create({ title: 'New Field Note' } as any)
      navigate(`/student/field-notes/${note.id}`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  if (loading) return <div className="p-8 text-center">{t('loading', 'Loading…')}</div>

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
          {t('field_notes', 'Field Notes')}
        </h1>
        <button
          onClick={handleNew}
          className="px-4 py-2 rounded-lg text-white font-medium"
          style={{ background: 'var(--primary)' }}
        >
          + {t('new_field_note', 'New Field Note')}
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700">{error}</div>}

      {notes.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <p className="text-lg mb-4">{t('no_field_notes', 'No field notes yet.')}</p>
          <button onClick={handleNew} className="px-6 py-2 rounded-lg text-white" style={{ background: 'var(--primary)' }}>
            {t('create_first_note', 'Create your first note')}
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {notes.map(note => (
            <li key={note.id}>
              <Link
                to={`/student/field-notes/${note.id}`}
                className="block p-4 rounded-xl border transition-shadow hover:shadow-md"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{note.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                    {note.status}
                  </span>
                </div>
                {note.created_at && (
                  <span className="text-xs mt-1 block" style={{ color: 'var(--text-faint)' }}>
                    {fmtDate(note.created_at)}
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

export default FieldNotesListPage
