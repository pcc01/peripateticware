import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@hooks/useAuth'
import { LearningSession, EvidenceOfLearning, InquiryEntry } from '@types/session'
import Card from '@components/common/Card'
import Button from '@components/common/Button'
import Badge from '@components/common/Badge'
import InquiryInterface from '@components/student/InquiryInterface'
import sessionService from '@services/sessionService'
import { Privacy } from '@utils/privacy'

const SessionPage: React.FC = () => {
  const { t } = useTranslation(['student', 'common'])
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [session, setSession] = useState<LearningSession | null>(null)
  const [evidence, setEvidence] = useState<EvidenceOfLearning | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<'inquiry' | 'evidence' | 'history'>('inquiry')

  useEffect(() => {
    loadSessionData()
  }, [sessionId])

  const loadSessionData = async () => {
    if (!sessionId) return

    try {
      const sessionData = await sessionService.getSession(sessionId)
      setSession(sessionData)

      // Load evidence (privacy-filtered for student)
      const evidenceData = await sessionService.getEvidence(sessionId, user?.role || 'student')
      setEvidence(evidenceData)
    } catch (error) {
      console.error('Failed to load session:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInquirySubmitted = (inquiry: InquiryEntry) => {
    if (session) {
      setSession({
        ...session,
        inquiry_log: [...session.inquiry_log, inquiry],
      })
    }
  }

  const handleEndSession = async () => {
    if (!sessionId) return

    if (confirm(t('student:session.confirmEndSession'))) {
      try {
        await sessionService.updateSession(sessionId, {
          status: 'completed',
        })
        navigate('/student')
      } catch (error) {
        console.error('Failed to end session:', error)
      }
    }
  }

  if (isLoading || !session) {
    return (
      <div className="container mx-auto py-8">
        <p>{t('common:loading')}</p>
      </div>
    )
  }

  // Check if user can view teacher-only data
  const canViewCompetency = Privacy.canViewCompetencyAssessment(user?.role || 'student')

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">{session.title}</h1>
            <p className="text-color-text-secondary">{session.location.name}</p>
          </div>
          <div className="flex gap-2">
            <Badge
              variant={
                session.status === 'in_progress'
                  ? 'warning'
                  : session.status === 'completed'
                    ? 'success'
                    : 'secondary'
              }
            >
              {session.status}
            </Badge>
            {session.status === 'in_progress' && (
              <Button variant="error" onClick={handleEndSession}>
                {t('student:session.endSession')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-color-border">
        <button
          onClick={() => setTab('inquiry')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            tab === 'inquiry'
              ? 'border-color-primary text-color-primary'
              : 'border-transparent text-color-text-secondary'
          }`}
        >
          {t('student:inquiry.title')}
        </button>
        <button
          onClick={() => setTab('evidence')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            tab === 'evidence'
              ? 'border-color-primary text-color-primary'
              : 'border-transparent text-color-text-secondary'
          }`}
        >
          {t('student:evidence.title')}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            tab === 'history'
              ? 'border-color-primary text-color-primary'
              : 'border-transparent text-color-text-secondary'
          }`}
        >
          {t('student:history.title')}
        </button>
      </div>

      {/* Inquiry Tab */}
      {tab === 'inquiry' && (
        <InquiryInterface
          session={session}
          onInquirySubmitted={handleInquirySubmitted}
        />
      )}

      {/* Evidence Tab */}
      {tab === 'evidence' && evidence && (
        <div className="space-y-4">
          <Card title={t('student:evidence.sessionSummary')}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm font-medium text-color-text-secondary">
                  {t('student:evidence.bloomLevel')}
                </p>
                <p className="text-xl font-bold text-color-primary">
                  {evidence.evidence.bloom_level_achieved}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-color-text-secondary">
                  {t('student:evidence.engagementScore')}
                </p>
                <p className="text-xl font-bold text-color-success">
                  {evidence.evidence.engagement_score}/10
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-color-text-secondary">
                  {t('common:duration')}
                </p>
                <p className="text-xl font-bold">--</p>
              </div>
              <div>
                <p className="text-sm font-medium text-color-text-secondary">
                  {t('student:evidence.completionTime')}
                </p>
                <p className="text-xl font-bold">--</p>
              </div>
            </div>
          </Card>

          <Card title={t('student:evidence.keyConcepts')}>
            <ul className="space-y-2">
              {evidence.evidence.key_concepts.map((concept, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-color-primary font-bold">✓</span>
                  <p>{concept}</p>
                </li>
              ))}
            </ul>
          </Card>

          {/* Teacher-only: Competency Assessment */}
          {canViewCompetency && evidence.competency_assessment && (
            <>
              <Card title={t('teacher:evidence.title')}>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">
                      {t('teacher:evidence.bloomLevelDescription')}
                    </h4>
                    <p className="text-color-text-secondary">
                      {evidence.competency_assessment.teacher_notes}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Standards Evidence</h4>
                    <ul className="space-y-1 text-sm">
                      {evidence.competency_assessment.standards_evidence.map(
                        (standard, idx) => (
                          <li key={idx} className="text-color-text-secondary">
                            • {standard}
                          </li>
                        )
                      )}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Growth Recommendations</h4>
                    <ul className="space-y-1 text-sm">
                      {evidence.competency_assessment.growth_recommendations.map(
                        (rec, idx) => (
                          <li key={idx} className="text-color-text-secondary">
                            → {rec}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                </div>
              </Card>

              {/* Teacher-only: Original AI Artifact */}
              {evidence.original_ai_draft && (
                <Card title={t('teacher:evidence.originalDraft')}>
                  <pre className="bg-color-bg-secondary p-4 rounded text-xs overflow-x-auto max-h-64">
                    {evidence.original_ai_draft}
                  </pre>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <Card title={t('student:history.allSessions')}>
          {session.inquiry_log.length === 0 ? (
            <p className="text-center text-color-text-secondary">
              {t('student:history.noSessions')}
            </p>
          ) : (
            <div className="space-y-3">
              {session.inquiry_log.map((inquiry, idx) => (
                <Card key={idx} subtitle={new Date(inquiry.timestamp).toLocaleString()}>
                  <p className="font-medium mb-2">{inquiry.question}</p>
                  {inquiry.socratic_prompt && (
                    <p className="text-sm text-color-primary italic mb-2">
                      💭 {inquiry.socratic_prompt}
                    </p>
                  )}
                  {inquiry.confidence && (
                    <Badge variant="info" size="sm">
                      {(inquiry.confidence * 100).toFixed(0)}% confidence
                    </Badge>
                  )}
                </Card>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

export default SessionPage
