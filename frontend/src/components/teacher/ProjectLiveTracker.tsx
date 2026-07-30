// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ProjectLiveTracker
 * ──────────────────
 * Live map of every currently in-progress session across all activities in
 * a Project. A live twin of CourseFieldworkTracker.tsx (same map/sidebar
 * layout), but polling (via useProjectLiveTracking) instead of a single
 * historical fetch, and color-coded by activity instead of by student —
 * a project's whole point is bundling several activities together.
 *
 * Scope is gated on the existing per-activity
 * discovery_location_gps_capture_enabled flag server-side, not a new
 * project-level toggle — see backend/routes/projects.py.
 *
 * Usage:
 *   <ProjectLiveTracker projectId={project.id} />
 */

import React, { useMemo, useState } from 'react'
import { MapPin, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import FieldMap from '@/components/common/Map'
import Card from '@/components/common/Card'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import { useProjectLiveTracking } from '@/hooks/useProjectLiveTracking'

interface Props {
  projectId: string
}

// Derive a stable color per activity from its ID — same hashing approach
// CourseFieldworkTracker uses per-student, keyed on activity_id instead.
const ACTIVITY_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea',
  '#ea580c', '#0891b2', '#be185d', '#ca8a04',
]
function activityColor(activityId: string, palette = ACTIVITY_COLORS): string {
  const hash = activityId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

function elapsedLabel(startedAt: string | null): string {
  if (!startedAt) return ''
  const ms = Date.now() - new Date(startedAt).getTime()
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const ProjectLiveTracker: React.FC<Props> = ({ projectId }) => {
  const { t } = useTranslation(['common'])
  const { sessions, locations, gpsEnabledActivityCount, loading, error } =
    useProjectLiveTracking(projectId)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const visibleSessions = selectedSessionId
    ? sessions.filter((s) => s.session_id === selectedSessionId)
    : sessions

  const markers = visibleSessions
    .filter((s) => locations[s.session_id])
    .map((s) => {
      const loc = locations[s.session_id]
      return {
        location: { latitude: loc.latitude, longitude: loc.longitude, name: s.location_name ?? undefined },
        label: `${s.student_name.split(' ')[0]} — ${s.activity_title}`,
      }
    })

  const center: [number, number] | undefined = useMemo(() => {
    if (markers.length === 0) return undefined
    const avgLat = markers.reduce((sum, m) => sum + m.location.latitude, 0) / markers.length
    const avgLng = markers.reduce((sum, m) => sum + m.location.longitude, 0) / markers.length
    return [avgLat, avgLng]
  }, [markers])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-4 text-sm">
        {error}
      </div>
    )
  }

  if (gpsEnabledActivityCount === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-gray-400">
          <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {t('components_teacher_projectlivetracker.not_configured', 'No activities in this project have location tracking enabled.')}
          </p>
          <p className="text-xs mt-1">
            {t('components_teacher_projectlivetracker.not_configured_hint', 'Turn it on per-activity in the activity’s Location tab.')}
          </p>
        </div>
      </Card>
    )
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-gray-400">
          <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {t('components_teacher_projectlivetracker.empty', 'No one is currently active in this project.')}
          </p>
          <p className="text-xs mt-1">
            {t('components_teacher_projectlivetracker.empty_hint', 'This updates automatically once a student starts a field session.')}
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Map — spans 2 cols */}
      <div className="lg:col-span-2">
        <Card title={t('components_teacher_projectlivetracker.title_live_map', 'Live Map')}>
          <FieldMap center={center} zoom={13} height="480px" markers={markers} />
          {selectedSessionId && (
            <button
              onClick={() => setSelectedSessionId(null)}
              className="mt-2 text-xs text-color-primary hover:underline"
            >
              ← {t('components_teacher_projectlivetracker.show_all', 'Show everyone')}
            </button>
          )}
        </Card>
      </div>

      {/* Sidebar: active sessions */}
      <div className="space-y-3">
        <Card title={`${t('components_teacher_projectlivetracker.active_now', 'Active Now')} (${sessions.length})`}>
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.session_id}
                onClick={() => setSelectedSessionId(s.session_id === selectedSessionId ? null : s.session_id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedSessionId === s.session_id
                    ? 'border-color-primary bg-color-primary-light'
                    : 'border-color-border hover:border-color-primary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: activityColor(s.activity_id) }}
                  />
                  <p className="text-sm font-medium truncate flex-1">{s.student_name}</p>
                  <span className="text-[10px] font-semibold text-color-primary tracking-wide">
                    {t('components_teacher_projectlivetracker.live', 'LIVE')}
                  </span>
                </div>
                <p className="text-xs text-color-text-secondary mt-1 pl-4 truncate">{s.activity_title}</p>
                <p className="text-xs text-color-text-tertiary pl-4">{elapsedLabel(s.started_at)}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-sm text-color-text-secondary">
            <Users className="w-4 h-4" />
            <span>
              {t('components_teacher_projectlivetracker.students_active', '{{count}} students active right now', { count: sessions.length })}
            </span>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default ProjectLiveTracker
