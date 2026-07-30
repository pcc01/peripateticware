// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ProjectCompletionReport
 * ────────────────────────
 * "What's the status right now" snapshot for a long-running Project — the
 * useful *primary* view once continuous live tracking (ProjectLiveTracker)
 * isn't, for a project running unattended over weeks. One-time fetch, no
 * polling, no date-range filter — see backend/routes/projects.py's
 * project_completion_report for why (a snapshot, not a period export like
 * homeschool's reports).
 *
 * Usage:
 *   <ProjectCompletionReport projectId={project.id} />
 */

import React, { useEffect, useState } from 'react'
import { ClipboardList, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Card from '@/components/common/Card'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import { projectTrackingApi } from '@/services/phase7Api'
import type { ProjectCompletionReportResponse, ProjectCompletionActivityStatus } from '@/types/phase7'

interface Props {
  projectId: string
}

function statusBadge(status: ProjectCompletionActivityStatus, t: (k: string, d: string) => string) {
  const styles: Record<ProjectCompletionActivityStatus, string> = {
    completed: 'bg-green-100 text-green-700',
    in_progress: 'bg-amber-100 text-amber-700',
    not_started: 'bg-gray-100 text-gray-400',
  }
  const labels: Record<ProjectCompletionActivityStatus, string> = {
    completed: t('components_teacher_projectcompletionreport.status_completed', 'Completed'),
    in_progress: t('components_teacher_projectcompletionreport.status_in_progress', 'In progress'),
    not_started: t('components_teacher_projectcompletionreport.status_not_started', 'Not started'),
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

const ProjectCompletionReport: React.FC<Props> = ({ projectId }) => {
  const { t } = useTranslation(['common'])
  const [data, setData] = useState<ProjectCompletionReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    projectTrackingApi
      .getProjectCompletionReport(projectId)
      .then((r) => {
        if (!cancelled) setData(r)
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? 'Failed to load completion report')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

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

  if (!data || data.activities.length === 0) {
    return (
      <Card>
        <div className="text-center py-12 text-gray-400">
          <ClipboardList className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {t('components_teacher_projectcompletionreport.empty', 'No activities linked to this project yet.')}
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card title={t('components_teacher_projectcompletionreport.title_by_activity', 'Completion by Activity')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-color-text-tertiary border-b border-color-border">
                <th className="py-2 pr-4 font-medium">{t('components_teacher_projectcompletionreport.col_activity', 'Activity')}</th>
                <th className="py-2 pr-4 font-medium">{t('components_teacher_projectcompletionreport.col_completed', 'Completed')}</th>
                <th className="py-2 pr-4 font-medium">{t('components_teacher_projectcompletionreport.col_participants', 'Participants')}</th>
                <th className="py-2 pr-4 font-medium">{t('components_teacher_projectcompletionreport.col_evidence', 'Evidence')}</th>
              </tr>
            </thead>
            <tbody>
              {data.activities.map((a) => (
                <tr key={a.activity_id} className="border-b border-color-border last:border-0">
                  <td className="py-2 pr-4">{a.activity_title}</td>
                  <td className="py-2 pr-4">{a.completed_sessions} / {a.total_sessions}</td>
                  <td className="py-2 pr-4">{a.participant_count}</td>
                  <td className="py-2 pr-4">{a.evidence_capture_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('components_teacher_projectcompletionreport.title_by_participant', 'Completion by Participant')}>
        {data.participants.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Users className="w-6 h-6 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {t('components_teacher_projectcompletionreport.no_participants', 'No one has started this project yet.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-color-text-tertiary border-b border-color-border">
                  <th className="py-2 pr-4 font-medium">{t('components_teacher_projectcompletionreport.col_student', 'Student')}</th>
                  {data.activities.map((a) => (
                    <th key={a.activity_id} className="py-2 pr-4 font-medium">{a.activity_title}</th>
                  ))}
                  <th className="py-2 pr-4 font-medium">{t('components_teacher_projectcompletionreport.col_last_activity', 'Last Activity')}</th>
                  <th className="py-2 pr-4 font-medium">{t('components_teacher_projectcompletionreport.col_evidence', 'Evidence')}</th>
                </tr>
              </thead>
              <tbody>
                {data.participants.map((p) => (
                  <tr key={p.student_id} className="border-b border-color-border last:border-0">
                    <td className="py-2 pr-4 font-medium">{p.student_name}</td>
                    {data.activities.map((a) => (
                      <td key={a.activity_id} className="py-2 pr-4">
                        {statusBadge(p.activities[a.activity_id] ?? 'not_started', t)}
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-color-text-secondary">
                      {p.last_activity_at ? new Date(p.last_activity_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 pr-4">{p.evidence_capture_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default ProjectCompletionReport
