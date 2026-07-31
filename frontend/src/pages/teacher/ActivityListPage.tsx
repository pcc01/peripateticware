/**
 * ActivityListPage.tsx — Teacher Activity Management
 * FIXED: fetches from backend API instead of using hardcoded mock data.
 *
 * Copyright (c) 2026 Paul Christopher Cerda
 * BSL-1.1 License
 */
import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/utils/errorMessage'

const API_BASE = '/api/v1'

interface Activity {
  id: string | number
  title: string
  description?: string
  status: 'draft' | 'published' | 'archived'
  subject?: string
  grade_level?: number
  estimated_duration_minutes?: number
  created_at?: string
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const ActivityListPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate()
  const location = useLocation()
  const isHomeschool = location.pathname.startsWith('/homeschool')
  const activitiesBase = isHomeschool
    ? '/homeschool/activities'
    : '/teacher/activities'
  const trackingSettingsPath = isHomeschool
    ? '/homeschool/tracking-settings'
    : '/teacher/tracking-settings'
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [publishingId, setPublishingId] = useState<string | number | null>(null)
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchActivities = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await axios.get(`${API_BASE}/activities`, {
          headers: getAuthHeader(),
        })
        // Handle both array response and paginated { items: [...] } response
        const data = Array.isArray(res.data)
          ? res.data
          : (res.data.items ?? res.data.activities ?? res.data.results ?? [])
        setActivities(data)
      } catch (err: any) {
        // err.response.data.detail can be a structured object/array (FastAPI
        // 422 validation errors, upgrade-required payloads, etc.) rather than
        // a plain string — rendering that directly as a React child throws
        // "Minified React error #31" and unmounts the app. Always coerce.
        const msg = getErrorMessage(err, 'Failed to load activities')
        setError(msg)
        console.error('ActivityListPage fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchActivities()
  }, [])

  const filtered = activities.filter(a =>
    a.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Backend already has a working POST /activities/{id}/publish endpoint
  // (runs a privacy-compliance check, then sets status='published') — it was
  // just never called from any real UI. This is what makes an activity show
  // up in the Shared Library, since that query requires status='published'.
  const handlePublish = async (activity: Activity, e: React.MouseEvent) => {
    e.stopPropagation()
    setPublishingId(activity.id)
    setPublishErrors(prev => { const next = { ...prev }; delete next[String(activity.id)]; return next })
    try {
      await axios.post(`${API_BASE}/activities/${activity.id}/publish`, {}, {
        headers: getAuthHeader(),
      })
      setActivities(prev => prev.map(a =>
        a.id === activity.id ? { ...a, status: 'published' } : a
      ))
    } catch (err: any) {
      const msg = getErrorMessage(err, 'Failed to publish activity')
      setPublishErrors(prev => ({ ...prev, [String(activity.id)]: msg }))
    } finally {
      setPublishingId(null)
    }
  }

  const statusBadge = (status: Activity['status']) => {
    const styles: Record<string, React.CSSProperties> = {
      draft:     { background: '#f3f4f6', color: '#374151' },
      published: { background: '#d1fae5', color: '#065f46' },
      archived:  { background: '#fef3c7', color: '#92400e' },
    }
    return (
      <span style={{
        ...(styles[status] ?? styles.draft),
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'capitalize',
      }}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>{t('pages_teacher_activitylistpage.loading_activities', 'Loading activities…')}</div>
    )
  }

  return (
    <div style={{ background: 'var(--bg, #faf7f2)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>{t('activitylistpage.activities', 'Activities')}</h1>
            <p style={{ color: '#6b7280', marginTop: '6px' }}>{t('activitylistpage.create_and_manage_outdoor_learning_activ', 'Create and manage outdoor learning activities')}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => navigate(trackingSettingsPath)}
              style={{
                background: 'transparent',
                color: '#4a7c59',
                border: '1px solid #4a7c59',
                borderRadius: '8px',
                padding: '10px 20px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              📍 {t('pages_teacher_activitylistpage.tracking_settings', 'Tracking Settings')}
            </button>
            <button
              onClick={() => navigate(`${activitiesBase}/new`)}
              style={{
                background: '#4a7c59',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.95rem',
              }}
            >
              + New Activity
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '24px' }}>
          <input
            type="search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={t('pages_teacher_activitylistpage.placeholder_search_activities', 'Search activities…')}
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '10px 14px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '0.95rem',
              outline: 'none',
            }}
          />
        </div>

        {/* Error state */}
        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            color: '#991b1b',
          }}>
            <strong>Error:</strong> {error}
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#6b7280' }}>{t('pages_teacher_activitylistpage.make_sure_the_backend_is_running_and_you', 'Make sure the backend is running and you are logged in.')}</div>
          </div>
        )}

        {/* Empty state */}
        {!error && filtered.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '64px 24px',
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
          }}>
            <p style={{ fontSize: '1.1rem', color: '#6b7280', margin: 0 }}>
              {searchTerm
                ? `No activities matching "${searchTerm}"`
                : 'No activities yet — create your first one!'}
            </p>
          </div>
        )}

        {/* Activity list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(activity => (
            <div
              key={activity.id}
              onClick={() => navigate(`${activitiesBase}/${activity.id}`)}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '20px 24px',
                cursor: 'pointer',
                transition: 'box-shadow 0.15s',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 600, color: '#1a1a1a' }}>
                  {activity.title}
                </h3>
                {activity.description && (
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
                    {activity.description.slice(0, 100)}{activity.description.length > 100 ? '…' : ''}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '0.8rem', color: '#9ca3af' }}>
                  {activity.subject && <span>{activity.subject}</span>}
                  {activity.grade_level && <span>Grade {activity.grade_level}</span>}
                  {activity.estimated_duration_minutes && (
                    <span>{activity.estimated_duration_minutes} min</span>
                  )}
                </div>
              </div>
              <div style={{ marginLeft: '16px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {statusBadge(activity.status)}
                {(activity.status === 'draft' || activity.status === 'archived') && (
                  <button
                    onClick={e => handlePublish(activity, e)}
                    disabled={publishingId === activity.id}
                    title="Publish — makes this activity visible to students and eligible for the Shared Library"
                    style={{
                      background: publishingId === activity.id ? '#9ca3af' : '#4a7c59',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: publishingId === activity.id ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {publishingId === activity.id ? 'Publishing…' : '📣 Publish'}
                  </button>
                )}
                {!isHomeschool && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      navigate(`/teacher/activities/${activity.id}/fieldwork`)
                    }}
                    title={t('pages_teacher_activitylistpage.title_fieldwork_map', 'Fieldwork Map — GPS locations submitted by students')}
                    style={{
                      background: 'none',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '0.78rem',
                      color: '#6b7280',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    🗺 Fieldwork Map
                  </button>
                )}
                <button
                  onClick={e => {
                    e.stopPropagation()
                    navigate(`${activitiesBase}/${activity.id}/student-preview`)
                  }}
                  title={t('pages_teacher_activitylistpage.title_preview_as_student', 'Preview as Student')}
                  style={{
                    background: 'none',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    color: '#6b7280',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  👁 Student View
                </button>
              </div>
              {publishErrors[String(activity.id)] && (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    fontSize: '0.72rem',
                    color: '#991b1b',
                    maxWidth: '220px',
                    textAlign: 'right',
                  }}
                >
                  {publishErrors[String(activity.id)]}
                </div>
              )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ActivityListPage
