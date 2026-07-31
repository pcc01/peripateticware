// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * TrackingSettingsPage
 * ─────────────────────
 * Unified, account-level view of GPS live-tracking across every one of a
 * teacher's activities, with bulk on/off control — previously tracking was
 * only visible/configurable one activity at a time in ActivityManager's
 * Location tab, with no way to see or bulk-change what's currently on
 * across a whole account (WORK_TRACKING.md Session 47 item 4).
 *
 * Each row also shows the tiered-polling cadence (services/polling.py) that
 * activity would use if a session were live right now — trip (5s/15s) vs
 * long-running (60s/180s, for activities linked to a Project).
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Card from '@/components/common/Card'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import { trackingSettingsApi } from '@/services/phase7Api'
import type { TrackingSettingsRow } from '@/types/phase7'

const TrackingSettingsPage: React.FC = () => {
  const { t } = useTranslation(['common'])
  const navigate = useNavigate()
  const location = useLocation()
  const activitiesBase = location.pathname.startsWith('/homeschool') ? '/homeschool/activities' : '/teacher/activities'

  const [rows, setRows] = useState<TrackingSettingsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<Set<string>>(new Set())

  const load = () => {
    setLoading(true)
    setError(null)
    trackingSettingsApi
      .list()
      .then(setRows)
      .catch((err: any) => setError(err?.message ?? 'Failed to load tracking settings'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const allSelected = rows.length > 0 && selected.size === rows.length

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.activity_id)))
  }

  const toggleSelectOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setRowGps = async (row: TrackingSettingsRow, enabled: boolean) => {
    setRowBusy((prev) => new Set(prev).add(row.activity_id))
    // Optimistic — this is a single boolean flip on an already-loaded row,
    // not worth a full reload for.
    setRows((prev) => prev.map((r) => (r.activity_id === row.activity_id ? { ...r, gps_enabled: enabled } : r)))
    try {
      await trackingSettingsApi.setOne(row.activity_id, enabled)
    } catch (err: any) {
      setRows((prev) => prev.map((r) => (r.activity_id === row.activity_id ? { ...r, gps_enabled: !enabled } : r)))
      setError(err?.message ?? 'Failed to update tracking')
    } finally {
      setRowBusy((prev) => {
        const next = new Set(prev)
        next.delete(row.activity_id)
        return next
      })
    }
  }

  const bulkSet = async (enabled: boolean) => {
    if (selected.size === 0) return
    setBulkBusy(true)
    setError(null)
    try {
      await trackingSettingsApi.setBulk([...selected], enabled)
      setRows((prev) => prev.map((r) => (selected.has(r.activity_id) ? { ...r, gps_enabled: enabled } : r)))
      setSelected(new Set())
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update tracking')
    } finally {
      setBulkBusy(false)
    }
  }

  const tierLabel = (seconds: number) =>
    seconds <= 15
      ? t('pages_teacher_trackingsettings.tier_trip', 'Trip (fast)')
      : t('pages_teacher_trackingsettings.tier_long_running', 'Long-running (slow)')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto p-4">
        <button
          onClick={() => navigate(activitiesBase)}
          className="mb-4 text-sm flex items-center gap-1 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--primary)' }}
        >
          {t('pages_teacher_trackingsettings.back', '← Back to Activities')}
        </button>

        <div className="mb-4">
          <h1 className="h3 m-0">{t('pages_teacher_trackingsettings.title', 'Tracking Settings')}</h1>
          <p className="text-sm text-muted m-0">
            {t(
              'pages_teacher_trackingsettings.subtitle',
              'GPS live-tracking status across every activity in your account.'
            )}
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm mb-4">{error}</div>
        )}

        {rows.length === 0 ? (
          <Card>
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm font-medium">
                {t('pages_teacher_trackingsettings.empty', 'No activities yet.')}
              </p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                {t('pages_teacher_trackingsettings.select_all', 'Select all')}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-color-text-tertiary">
                  {t('pages_teacher_trackingsettings.selected_count', '{{count}} selected', { count: selected.size })}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={selected.size === 0 || bulkBusy}
                  onClick={() => bulkSet(true)}
                >
                  {t('pages_teacher_trackingsettings.enable_selected', 'Enable tracking')}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={selected.size === 0 || bulkBusy}
                  onClick={() => bulkSet(false)}
                >
                  {t('pages_teacher_trackingsettings.disable_selected', 'Disable tracking')}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-color-text-tertiary border-b border-color-border">
                    <th className="py-2 pr-2 font-medium" />
                    <th className="py-2 pr-4 font-medium">{t('pages_teacher_trackingsettings.col_activity', 'Activity')}</th>
                    <th className="py-2 pr-4 font-medium">{t('pages_teacher_trackingsettings.col_project', 'Project')}</th>
                    <th className="py-2 pr-4 font-medium">{t('pages_teacher_trackingsettings.col_tier', 'Poll cadence if live')}</th>
                    <th className="py-2 pr-4 font-medium">{t('pages_teacher_trackingsettings.col_tracking', 'Tracking')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.activity_id} className="border-b border-color-border last:border-0">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.activity_id)}
                          onChange={() => toggleSelectOne(r.activity_id)}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-color-text-tertiary">
                          {[r.subject, r.grade_level ? `Grade ${r.grade_level}` : null, r.status]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        {r.project_title ?? <span className="text-color-text-tertiary">—</span>}
                      </td>
                      <td className="py-2 pr-4">{tierLabel(r.poll_interval_seconds)}</td>
                      <td className="py-2 pr-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={r.gps_enabled}
                            disabled={rowBusy.has(r.activity_id)}
                            onChange={(e) => setRowGps(r, e.target.checked)}
                          />
                          <span className="text-xs">
                            {r.gps_enabled
                              ? t('pages_teacher_trackingsettings.on', 'On')
                              : t('pages_teacher_trackingsettings.off', 'Off')}
                          </span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

export default TrackingSettingsPage
