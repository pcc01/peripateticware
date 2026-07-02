// Copyright (c) 2026 Paul Christopher Cerda
// Block 13d — RubricBuilder component
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface Level { score: number; label: string; description: string }
interface Criterion { id: string; name: string; description: string; levels: Level[] }
interface RubricForm { title: string; description: string; criteria: Criterion[] }

function authHeader() {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}
async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers as any) },
  })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

function newCriterion(): Criterion {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    levels: [
      { score: 4, label: 'Exceeds', description: '' },
      { score: 3, label: 'Meets', description: '' },
      { score: 2, label: 'Approaching', description: '' },
      { score: 1, label: 'Beginning', description: '' },
    ],
  }
}

const RubricBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const location = useLocation()
  const rubricsBase = location.pathname.startsWith('/homeschool') ? '/homeschool/rubrics' : '/teacher/rubrics'

  const [form, setForm] = useState<RubricForm>({
    title: '', description: '', criteria: [newCriterion()],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    apiFetch<any>(`/rubrics/${id}`)
      .then(r => setForm({ title: r.title, description: r.description ?? '', criteria: r.criteria }))
      .catch(e => setError(e.message))
  }, [id])

  const totalPoints = form.criteria.reduce((sum, c) =>
    sum + Math.max(...c.levels.map(l => l.score), 0), 0)

  const updateCriterion = (idx: number, patch: Partial<Criterion>) =>
    setForm(f => ({ ...f, criteria: f.criteria.map((c, i) => i === idx ? { ...c, ...patch } : c) }))

  const updateLevel = (cIdx: number, lIdx: number, patch: Partial<Level>) =>
    updateCriterion(cIdx, {
      levels: form.criteria[cIdx].levels.map((l, i) => i === lIdx ? { ...l, ...patch } : l),
    })

  const removeCriterion = (idx: number) =>
    setForm(f => ({ ...f, criteria: f.criteria.filter((_, i) => i !== idx) }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const body = { title: form.title, description: form.description, criteria: form.criteria, total_points: totalPoints }
      if (isNew) {
        await apiFetch('/rubrics', { method: 'POST', body: JSON.stringify(body) })
      } else {
        await apiFetch(`/rubrics/${id}`, { method: 'PUT', body: JSON.stringify(body) })
      }
      navigate(rubricsBase)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
          {isNew ? t('new_rubric', 'New Rubric') : t('edit_rubric', 'Edit Rubric')}
        </h1>
        <span className="text-sm px-3 py-1 rounded-full" style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
          {totalPoints} {t('total_pts', 'total pts')}
        </span>
      </div>

      {error && <div className="mb-4 p-3 rounded bg-red-100 text-red-700">{error}</div>}

      {/* Title & description */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('title', 'Title')}</label>
          <input
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface)' }}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder={t('rubric_title_placeholder', 'e.g. Field Observation Rubric')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('description', 'Description')}</label>
          <textarea
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface)' }}
            rows={2}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>
      </div>

      {/* Criteria */}
      <div className="space-y-4 mb-6">
        {form.criteria.map((criterion, cIdx) => (
          <div key={criterion.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <input
                className="flex-1 px-3 py-1.5 rounded border text-sm font-medium"
                style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface-alt)' }}
                value={criterion.name}
                onChange={e => updateCriterion(cIdx, { name: e.target.value })}
                placeholder={t('criterion_name', 'Criterion name…')}
              />
              <button onClick={() => removeCriterion(cIdx)} className="text-xs px-2 py-1 rounded"
                style={{ color: 'var(--error)' }}>✕</button>
            </div>
            <input
              className="w-full px-3 py-1.5 rounded border text-sm mb-3"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-alt)' }}
              value={criterion.description}
              onChange={e => updateCriterion(cIdx, { description: e.target.value })}
              placeholder={t('criterion_description', 'What this criterion measures…')}
            />
            <div className="space-y-2">
              {criterion.levels.map((level, lIdx) => (
                <div key={lIdx} className="flex items-center gap-2">
                  <input type="number" min={0} max={100}
                    className="w-14 px-2 py-1 rounded border text-sm text-center"
                    aria-label={`Score for level ${lIdx + 1} of criterion ${cIdx + 1}`}
                    style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface-alt)' }}
                    value={level.score}
                    onChange={e => updateLevel(cIdx, lIdx, { score: parseInt(e.target.value) || 0 })}
                  />
                  <input className="w-28 px-2 py-1 rounded border text-sm"
                    aria-label={`Label for level ${lIdx + 1} of criterion ${cIdx + 1}`}
                    style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface-alt)' }}
                    value={level.label}
                    onChange={e => updateLevel(cIdx, lIdx, { label: e.target.value })}
                    placeholder={t('level_label', 'Label')}
                  />
                  <input className="flex-1 px-2 py-1 rounded border text-sm"
                    aria-label={`Description for level ${lIdx + 1} of criterion ${cIdx + 1}`}
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-alt)' }}
                    value={level.description}
                    onChange={e => updateLevel(cIdx, lIdx, { description: e.target.value })}
                    placeholder={t('level_description', 'Describe this level…')}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setForm(f => ({ ...f, criteria: [...f.criteria, newCriterion()] }))}
        className="w-full py-2 rounded-lg border text-sm mb-6"
        style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
      >
        + {t('add_criterion', 'Add Criterion')}
      </button>

      <button
        onClick={handleSave}
        disabled={saving || !form.title.trim()}
        className="w-full py-3 rounded-lg text-white font-medium disabled:opacity-50"
        style={{ background: 'var(--primary)' }}
      >
        {saving ? t('saving', 'Saving…') : t('save_rubric', 'Save Rubric')}
      </button>
    </div>
  )
}

export default RubricBuilder
