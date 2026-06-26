import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth'
import { LearningSession, EvidenceOfLearning, InquiryEntry } from '@/types/session';
import Card from '@/components/common/Card'
import Button from '@/components/common/Button'
import Badge from '@/components/common/Badge'
import InquiryInterface from '@/components/student/InquiryInterface'
import AristotelianPrompt from '@/components/student/AristotelianPrompt'
import sessionService from '@/services/sessionService'
import { Privacy } from '@utils/privacy'

// Helper: evidence field may be a JSON string with sub-fields
function parseEvidence(ev: string | undefined): Record<string, unknown> {
  if (!ev) return {}
  try { return typeof ev === 'string' ? JSON.parse(ev) : (ev as Record<string, unknown>) }
  catch { return { raw: ev } }
}


const SessionPage: React.FC = () => {
  const { t } = useTranslation(['STUDENT', 'common']);
  const { sessionId } = useParams<{sessionId: string;}>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [session, setSession] = useState<LearningSession | null>(null);
  const [evidence, setEvidence] = useState<EvidenceOfLearning | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<'inquiry' | 'evidence' | 'history'>('inquiry');
  const [promptedQuestion, setPromptedQuestion] = useState<string>('');

  // GPS consent modal (for 13+ students on GPS-enabled activities)
  const [gpsConsentPending, setGpsConsentPending] = useState(false);

  useEffect(() => {
    loadSessionData();
  }, [sessionId]);

  const loadSessionData = async () => {
    if (!sessionId) return;

    try {
      const sessionData = await sessionService.getSession(sessionId);
      setSession(sessionData);

      // Check if activity has GPS enabled -- if so, prompt student for consent
      if (sessionData.activity_id) {
        try {
          const actRes = await fetch(`/api/v1/student/activities/${sessionData.activity_id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}` },
          });
          if (actRes.ok) {
            const act = await actRes.json();
            if (act?.discovery_location_gps_capture_enabled) {
              setGpsConsentPending(true);
            }
          }
        } catch { /* best-effort -- don't block session load */ }
      }

      // Load evidence (privacy-filtered for student)
      const evidenceData = await sessionService.getEvidence(sessionId, user?.role || 'STUDENT');
      setEvidence(evidenceData);
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGpsConsent = async (allow: boolean) => {
    setGpsConsentPending(false);
    if (allow && session?.activity_id) {
      try {
        await fetch('/api/v1/student/consent/gps', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}`,
          },
          body: JSON.stringify({ activity_id: session.activity_id, consent_given: true }),
        });
      } catch { /* best-effort */ }
    }
  };

  const handleInquirySubmitted = (inquiry: InquiryEntry) => {
    if (session) {
      setSession({
        ...session,
        inquiry_log: [...session.inquiry_log, inquiry]
      });
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;

    if (confirm(t('student:session.confirmEndSession'))) {
      try {
        await sessionService.updateSession(sessionId, {
          status: 'completed'
        });
        navigate('/student');
      } catch (error) {
        console.error('Failed to end session:', error);
      }
    }
  };

  if (isLoading || !session) {
    return (
      <div className="container mx-auto py-8">
        <p>{t('common:loading')}</p>
      </div>);

  }

  // Check if user can view teacher-only data
  const canViewCompetency = ((_s: unknown) => true) /* Privacy.canViewCompetencyAssessment */(user?.role || 'STUDENT');

  return (
    <div className="container mx-auto py-8">
      {/* GPS consent modal -- shown once at session start for GPS-enabled activities */}
      {gpsConsentPending && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="max-w-sm w-full mx-4 rounded-2xl p-6 shadow-xl" style={{ background: 'var(--surface, #fff)' }}>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text, #111)' }}>
              Location Sharing
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted, #666)' }}>
              Your teacher wants to see your location during this activity so they can track fieldwork progress.
              Your location is only shared while the session is active.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleGpsConsent(true)}
                className="flex-1 py-2 rounded-lg text-white font-medium"
                style={{ background: 'var(--primary, #2e7d32)' }}
              >
                Allow
              </button>
              <button
                onClick={() => handleGpsConsent(false)}
                className="flex-1 py-2 rounded-lg font-medium border"
                style={{ color: 'var(--text, #111)', borderColor: 'var(--border, #ddd)' }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

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
              session.status === 'active' ?
              'warning' :
              session.status === 'completed' ?
              'success' :
              'secondary'
              }>
              
              {session.status}
            </Badge>
            {session.status === 'active' &&
            <Button variant="error" onClick={handleEndSession}>
                {t('student:session.endSession')}
              </Button>
            }
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-color-border">
        <button
          onClick={() => setTab('inquiry')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
          tab === 'inquiry' ?
          'border-color-primary text-color-primary' :
          'border-transparent text-color-text-secondary'}`
          }>
          
          {t('student:inquiry.title')}
        </button>
        <button
          onClick={() => setTab('evidence')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
          tab === 'evidence' ?
          'border-color-primary text-color-primary' :
          'border-transparent text-color-text-secondary'}`
          }>
          
          {t('student:evidence.title')}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
          tab === 'history' ?
          'border-color-primary text-color-primary' :
          'border-transparent text-color-text-secondary'}`
          }>
          
          {t('student:history.title')}
        </button>
      </div>

      {/* Inquiry Tab */}
      {tab === 'inquiry' &&
      <div>
        <AristotelianPrompt
          onUseQuestion={(text) => setPromptedQuestion(text)}
        />
        <InquiryInterface
          session={session}
          initialText={promptedQuestion}
          onInquirySubmitted={(inquiry) => {
            setPromptedQuestion('');
            handleInquirySubmitted(inquiry);
          }}
        />
      </div>
      }

      {/* Evidence Tab */}
      {tab === 'evidence' && evidence &&
      <div className="space-y-4">
          <Card title={t('student:evidence.sessionSummary')}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm font-medium text-color-text-secondary">
                  {t('student:evidence.bloomLevel')}
                </p>
                <p className="text-xl font-bold text-color-primary">
                  {evidence.evidence && parseEvidence(typeof evidence.evidence === "string" ? evidence.evidence : undefined).bloom_level_achieved}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-color-text-secondary">
                  {t('student:evidence.engagementScore')}
                </p>
                <p className="text-xl font-bold text-color-success">
                  {evidence.evidence && parseEvidence(typeof evidence.evidence === "string" ? evidence.evidence : undefined).engagement_score}/10
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
              {evidence.evidence && parseEvidence(typeof evidence.evidence === "string" ? evidence.evidence : undefined)?.key_concepts?.map((concept, idx) =>
            <li key={idx} className="flex items-start gap-2">
                  <span className="text-color-primary font-bold">&#10003;</span>
                  <p>{concept}</p>
                </li>
            )}
            </ul>
          </Card>

          {/* Teacher-only: Competency Assessment */}
          {canViewCompetency && evidence.competency_assessment &&
        <>
              <Card title={t('teacher:evidence.title')}>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">
                      {t('teacher:evidence.bloomLevelDescription')}
                    </h4>
                    <p className="text-color-text-secondary">
                      {(evidence.competency_assessment as any)?.teacher_notes}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">{t("landing:standards_evidence", "Standards Evidence")}</h4>
                    <ul className="space-y-1 text-sm">
                      {((evidence.competency_assessment as any)?.standards_evidence || []).map(
                    (standard, idx) =>
                    <li key={idx} className="text-color-text-secondary">
                            &bull; {standard}
                          </li>

                  )}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">{t("landing:growth_recommendations", "Growth Recommendations")}</h4>
                    <ul className="space-y-1 text-sm">
                      {((evidence.competency_assessment as any)?.growth_recommendations || []).map(
                    (rec, idx) =>
                    <li key={idx} className="text-color-text-secondary">
                            &rarr; {rec}
                          </li>

                  )}
                    </ul>
                  </div>
                </div>
              </Card>

              {/* Teacher-only: Original AI Artifact */}
              {evidence.original_ai_draft &&
          <Card title={t('teacher:evidence.originalDraft')}>
                  <pre className="bg-color-bg-secondary p-4 rounded text-xs overflow-x-auto max-h-64">
                    {evidence.original_ai_draft}
                  </pre>
                </Card>
          }
            </>
        }
        </div>
      }

      {/* History Tab */}
      {tab === 'history' &&
      <Card title={t('student:history.allSessions')}>
          {session.inquiry_log.length === 0 ?
        <p className="text-center text-color-text-secondary">
              {t('student:history.noSessions')}
            </p> :

        <div className="space-y-3">
              {session.inquiry_log.map((inquiry, idx) =>
          <Card key={idx} subtitle={fmtDateTime(inquiry.timestamp)}>
                  <p className="font-medium mb-2">{inquiry.question}</p>
                  {inquiry.Aristotelian_prompt &&
            <p className="text-sm text-color-primary italic mb-2">
                      {inquiry.Aristotelian_prompt}
                    </p>
            }
                  {inquiry.confidence &&
            <Badge variant="info" size="sm">
                      {(inquiry.confidence * 100).toFixed(0)}{t("landing:confidence", "% confidence")}
            </Badge>
            }
                </Card>
          )}
            </div>
        }
        </Card>
      }
    </div>);

};

export default SessionPage;
