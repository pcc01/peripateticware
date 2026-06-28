// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * CourseFieldworkTracker
 * ─────────────────────
 * Professor-side async view of where students have submitted fieldwork
 * for a given activity.  Shows a static map of GPS snapshots drawn from
 * stored lat/lng on field notes and evidence captures — no live tracking,
 * no WebSocket, no polling.
 *
 * Usage:
 *   <CourseFieldworkTracker activityId={activity.id} />
 */

import React, { useEffect, useMemo, useState } from 'react'
import { MapPin, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import FieldMap from '@/components/common/Map'
import Card from '@/components/common/Card'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import { professorApi } from '@/services/phase7Api'
import type { FieldworkLocation } from '@/types/phase7'

interface Props {
  activityId: string
}

// Derive a stable color per student from their ID
const STUDENT_COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea',
  '#ea580c', '#0891b2', '#be185d', '#ca8a04',
]
function studentColor(studentId: string, palette = STUDENT_COLORS): string {
  const hash = studentId
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

const CourseFieldworkTracker: React.FC<Props> = ({ activityId }) => {
  const { t } = useTranslation(['common'])
  const [locations, setLocations] = useState<FieldworkLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  useEffect(() => {
    if (!activityId) return
    setLoading(true)
    setError(null)
    professorApi
      .getFieldworkLocations(activityId)
      .then((res) => setLocations(res.locations))
      .catch(() => setError('Failed to load fieldwork locations'))
      .finally(() => setLoading(false))
  }, [activityId])

  // Unique students derived from location list
  const students = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; earliest: string | null; latest: string | null }>()
    for (const loc of locations) {
      const existing = map.get(loc.student_id)
      if (!existing) {
        map.set(loc.student_id, { id: loc.student_id, name: loc.student_name, count: 1, earliest: loc.submitted_at, latest: loc.submitted_at })
      } else {
        existing.count++
        if (loc.submitted_at && (!existing.earliest || loc.submitted_at < existing.earliest)) existing.earliest = loc.submitted_at
        if (loc.submitted_at && (!existing.latest  || loc.submitted_at > existing.latest))   existing.latest  = loc.submitted_at
      }
    }
    return Array.from(map.values())
  }, [locations])

  // Visible locations: all or filtered to selected student
  const visibleLocations = selectedStudentId
    ? locations.filter((l) => l.student_id === selectedStudentId)
    : locations

  // Map markers
  const markers = visibleLocations.map((loc) => ({
    location: { latitude: loc.latitude, longitude: loc.longitude, name: loc.location_name ?? undefined },
    label: `${loc.student_name.split(' ')[0]} — ${fmtDate(loc.submitted_at)}`,
  }))

  // Map center: centroid of visible pins, or first pin
  const center: [number, number] | undefined = useMemo(() => {
    if (visibleLocations.length === 0) return undefined
    const avgLat = visibleLocations.reduce((s, l) => s + l.latitude, 0) / visibleLocations.length
    const avgLng = visibleLocations.reduce((s, l) => s + l.longitude, 0) / visibleLocations.length
    return [avgLat, avgLng]
  }, [visibleLocations])

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

  if (locations.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-gray-400">
          <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">{t('components_teacher_coursefieldworktracker.no_fieldwork_submissions_yet', 'No fieldwork submissions yet.')}</p>
          <p className="text-xs mt-1">{t('components_teacher_coursefieldworktracker.gps_pins_will_appear_here_once_students_', 'GPS pins will appear here once students submit field notes or captures.')}</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Map — spans 2 cols */}
      <div className="lg:col-span-2">
        <Card title="Fieldwork Locations">
          <FieldMap
            center={center}
            zoom={12}
            height="480px"
            markers={markers}
          />
          {selectedStudentId && (
            <button
              onClick={() => setSelectedStudentId(null)}
              className="mt-2 text-xs text-color-primary hover:underline"
            >
              ← Show all students
            </button>
          )}
        </Card>
      </div>

      {/* Student sidebar */}
      <div className="space-y-3">
        <Card title={`Students (${students.length})`}>
          <div className="space-y-2">
            {students.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStudentId(s.id === selectedStudentId ? null : s.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedStudentId === s.id
                    ? 'border-color-primary bg-color-primary-light'
                    : 'border-color-border hover:border-color-primary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: studentColor(s.id) }}
                  />
                  <p className="text-sm font-medium truncate">{s.name}</p>
                </div>
                <p className="text-xs text-color-text-secondary mt-1 pl-4">
                  {s.count} {s.count === 1 ? 'submission' : 'submissions'}
                </p>
                {s.earliest && (
                  <p className="text-xs text-color-text-tertiary pl-4">
                    {fmtDate(s.earliest)}
                    {s.latest !== s.earliest ? ` → ${fmtDate(s.latest)}` : ''}
                  </p>
                )}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-sm text-color-text-secondary">
            <Users className="w-4 h-4" />
            <span>{locations.length} total GPS snapshots from {students.length} students</span>
          </div>
          <p className="text-xs text-color-text-tertiary mt-2">{t('components_teacher_coursefieldworktracker.pins_are_stored_snapshots_from_field_not', 'Pins are stored snapshots from field note and capture submissions — not live tracking.')}</p>
        </Card>
      </div>
    </div>
  )
}

export default CourseFieldworkTracker;
