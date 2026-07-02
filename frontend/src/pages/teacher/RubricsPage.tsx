// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface Rubric {
  id: string
  title: string
  description?: string
  total_points: number
  criteria: any[]
  created_at: string
}

function authHeader() {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(options.headers as any) },
  })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

const RubricsPage: React.FC = () => {
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const location = useLocation()
  const rubricsBase = location.pathname.startsWith('/homeschool') ? '/homeschool/rubrics' : '/teacher/rubrics'
  const [rubrics, setRubrics] = useState<Rubric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    apiFetch<Rubric[]>('/rubrics')
      .then(setRubrics)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirm_delete_rubric', 'Delete this rubric?'))) return
    try {
      await apiFetch(`/rubrics/${id}`, { method: 'DELETE' })
      setRubrics(r => r.filter(x => x.id !== id))
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
          {t('rubrics', 'Rubrics')}
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            to={`${rubricsBase}/import`}
            className="px-4 py-2 rounded-lg font-medium"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            📄 {t('import_rubric', 'Import PDF/CSV')}
          </Link>
          <Link
            to={`${rubricsBase}/new`}
            className="px-4 py-2 rounded-lg text-white font-medium"
            style={{ background: 'var(--primary)' }}
          >
            + {t('new_rubric', 'New Rubric')}
          </Link>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>{t('loading', 'Loading…')}</div>
      ) : rubrics.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <p className="mb-4">{t('no_rubrics', 'No rubrics yet.')}</p>
          <Link to={`${rubricsBase}/new`} className="px-6 py-2 rounded-lg text-white" style={{ background: 'var(--primary)' }}>
            {t('create_first_rubric', 'Create your first rubric')}
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rubrics.map(r => (
            <li key={r.id} className="flex items-center justify-between p-4 rounded-xl border"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div>
                <div className="font-medium" style={{ color: 'var(--text)' }}>{r.title}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {r.criteria?.length ?? 0} {t('criteria', 'criteria')} · {r.total_points} {t('pts', 'pts')}
                </div>
              </div>
              <div className="flex gap-2">
                <Link to={`${rubricsBase}/${r.id}`}
                  className="px-3 py-1 rounded text-sm border"
                  style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>
                  {t('edit', 'Edit')}
                </Link>
                <button onClick={() => handleDelete(r.id)}
                  className="px-3 py-1 rounded text-sm border"
                  style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>
                  {t('delete', 'Delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default RubricsPage;
