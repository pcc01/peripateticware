// Copyright (c) 2026 Paul Christopher Cerda
// Block 13e — What the student sees on their phone
import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTeacherStore } from '../../stores/teacher'

const PHASES = ['Orient', 'Observe', 'Capture', 'Reflect'] as const

const CaptureButton: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <div className="flex flex-col items-center gap-1 opacity-60 cursor-not-allowed select-none">
    <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
      style={{ background: 'var(--surface-alt)' }}>
      {icon}
    </div>
    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
  </div>
)

const StudentActivityPreview: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation('landing')
  const navigate = useNavigate()
  const { currentActivity, fetchActivity, activityLoading } = useTeacherStore()

  React.useEffect(() => {
    if (id) fetchActivity(id)
  }, [id])

  const activity = currentActivity

  return (
    <div className="min-h-screen p-6 flex flex-col items-center"
      style={{ background: 'var(--bg)' }}>
      {/* Back button */}
      <div className="w-full max-w-sm mb-4">
        <button
          onClick={() => navigate(id ? `/teacher/activities/${id}` : '/teacher/activities')}
          className="text-sm flex items-center gap-1"
          style={{ color: 'var(--text-muted)' }}
        >
          ← {t('back_to_editor', 'Back to editor')}
        </button>
      </div>

      <p className="text-xs mb-3 font-medium tracking-wide uppercase"
        style={{ color: 'var(--text-faint)' }}>
        {t('student_preview', 'Preview as Student')}
      </p>

      {/* Phone frame */}
      <div className="relative w-80 rounded-[2.5rem] border-4 shadow-2xl overflow-hidden"
        style={{ borderColor: 'var(--text)', background: 'var(--surface)', minHeight: 580 }}>
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 rounded-b-2xl z-10"
          style={{ background: 'var(--text)' }} />

        <div className="pt-8 pb-6 px-5 overflow-y-auto" style={{ maxHeight: 620 }}>
          {activityLoading || !activity ? (
            <div className="flex items-center justify-center h-40"
              style={{ color: 'var(--text-muted)' }}>
              {activityLoading ? t('loading', 'Loading…') : t('no_activity', 'No activity data')}
            </div>
          ) : (
            <>
              {/* Location pin */}
              {activity.location_name && (
                <div className="flex items-center gap-1 mb-3 text-xs"
                  style={{ color: 'var(--primary)' }}>
                  📍 {activity.location_name}
                </div>
              )}

              {/* Title */}
              <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>
                {activity.title}
              </h2>

              {/* Meta chips */}
              <div className="flex flex-wrap gap-1 mb-3">
                {activity.subject && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--primary-muted)', color: 'var(--primary)' }}>
                    {activity.subject}
                  </span>
                )}
                {activity.grade_level && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                    Grade {activity.grade_level}
                  </span>
                )}
                {(activity as any).bloom_level && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)' }}>
                    {(activity as any).bloom_level}
                  </span>
                )}
              </div>

              {/* Description */}
              {activity.description && (
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  {activity.description}
                </p>
              )}

              {/* Phase progress bar */}
              <div className="mb-4">
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-faint)' }}>
                  {t('your_journey', 'Your Journey')}
                </p>
                <div className="flex gap-1">
                  {PHASES.map((phase, i) => (
                    <div key={phase} className="flex-1 text-center">
                      <div className="h-1.5 rounded-full mb-1"
                        style={{ background: i === 0 ? 'var(--primary)' : 'var(--border)' }} />
                      <span className="text-xs" style={{ color: i === 0 ? 'var(--primary)' : 'var(--text-faint)' }}>
                        {phase}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Learning objectives */}
              {activity.learning_objectives?.length > 0 && (
                <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--surface-alt)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>
                    {t('what_youll_discover', "What you'll discover")}
                  </p>
                  <ul className="space-y-1">
                    {activity.learning_objectives.slice(0, 3).map((obj: string, i: number) => (
                      <li key={i} className="text-xs flex gap-1.5" style={{ color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--primary)' }}>→</span> {obj}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sample Socratic prompt */}
              <div className="mb-4 p-3 rounded-xl border"
                style={{ borderColor: 'var(--primary)', background: 'var(--primary-muted)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--primary)' }}>
                  🔍 {t('think_about', 'Think about…')}
                </p>
                <p className="text-xs italic" style={{ color: 'var(--text)' }}>
                  {t('sample_prompt', 'What do you notice first when you arrive? What surprises you?')}
                </p>
              </div>

              {/* Capture toolbar preview */}
              <div className="mb-4">
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-faint)' }}>
                  {t('capture_evidence', 'Capture evidence')}
                </p>
                <div className="flex justify-around">
                  <CaptureButton icon="📷" label={t('photo', 'Photo')} />
                  <CaptureButton icon="🎤" label={t('audio', 'Audio')} />
                  <CaptureButton icon="✏️" label={t('notes', 'Notes')} />
                  <CaptureButton icon="🖊" label={t('sketch', 'Sketch')} />
                </div>
              </div>

              {/* Start button */}
              <button
                disabled
                className="w-full py-3 rounded-xl text-white font-semibold opacity-50 cursor-not-allowed text-sm"
                style={{ background: 'var(--primary)' }}
              >
                {t('start_activity', "You're here — Start capturing!")}
              </button>
            </>
          )}
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-1 rounded-full"
          style={{ background: 'var(--text-faint)' }} />
      </div>

      <p className="text-xs mt-4" style={{ color: 'var(--text-faint)' }}>
        {t('preview_note', 'Capture buttons are disabled in preview mode')}
      </p>
    </div>
  )
}

export default StudentActivityPreview
