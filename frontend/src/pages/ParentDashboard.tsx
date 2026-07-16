// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Parent Dashboard - Fully Wired with Zustand Stores & API Services
 * Displays: Linked Children, Child Progress, Child Activities
 * Child linking has its own page at /parent/link-child
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useParentStore } from '@/stores';
import styles from './ParentDashboard.module.css';
import { fmtDate } from '@/utils/date';

// ── Consent status mini-panel ─────────────────────────────────────────────────
interface ConsentStatus {
  childId: string;
  childName: string;
  studentHash: string;
  hasConsent: boolean;
  loading: boolean;
}

async function fetchConsentForChild(childId: string, childName: string): Promise<ConsentStatus> {
  // Derive student_hash using the same SHA-256 approach as the backend
  const idBytes = new TextEncoder().encode(childId);
  let studentHash = '0'.repeat(64);
  try {
    const buf = await crypto.subtle.digest('SHA-256', idBytes);
    studentHash = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch { /* fallback to zero hash */ }

  try {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`/api/v1/privacy/consent/${studentHash}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      return { childId, childName, studentHash, hasConsent: data.has_active_consent, loading: false };
    }
  } catch { /* non-fatal */ }
  return { childId, childName, studentHash, hasConsent: false, loading: false };
}

function ConsentStatusPanel({ linkedChildren }: { linkedChildren: { id: string; full_name: string }[] }) {
  const { t } = useTranslation('landing');
  const [statuses, setStatuses] = useState<ConsentStatus[]>([]);

  useEffect(() => {
    if (!linkedChildren.length) return;
    // Start all loading
    setStatuses(linkedChildren.map(c => ({ childId: c.id, childName: c.full_name, studentHash: '', hasConsent: false, loading: true })));
    Promise.all(linkedChildren.map(c => fetchConsentForChild(c.id, c.full_name)))
      .then(results => setStatuses(results));
  }, [linkedChildren.map(c => c.id).join(',')]);

  if (!statuses.length) return null;

  return (
    <section style={{ marginTop: 24, padding: '16px 20px', background: 'var(--surface-alt, #f9fafb)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text, #111)' }}>{t('pages_parentdashboard.parental_consent_status', 'Parental Consent Status')}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {statuses.map(s => (
          <div key={s.childId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'white', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}>
            <span style={{ fontSize: 14, color: 'var(--text, #111)' }}>{s.childName}</span>
            {s.loading ? (
              <span style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)' }}>{t('pages_parentdashboard.checking', 'Checking…')}</span>
            ) : s.hasConsent ? (
              <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>{t('pages_parentdashboard.consent_granted', 'Consent granted ✓')}</span>
            ) : (
              <a href={`/parent-consent/${s.studentHash}`} style={{ fontSize: 12, color: '#b45309', fontWeight: 600, textDecoration: 'underline' }}>{t('pages_parentdashboard.consent_pending_review', 'Consent pending — Review')}</a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export const ParentDashboard: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();

  const {
    dashboardData,
    linkedChildren,
    selectedChildId,
    childProgress,
    loading,
    error,
    fetchDashboard,
    fetchLinkedChildren,
    fetchChildProgress,
    selectChild,
    clearError,
  } = useParentStore();

  useEffect(() => {
    const load = async () => {
      try {
        await Promise.all([fetchDashboard(), fetchLinkedChildren()]);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (selectedChildId) fetchChildProgress(selectedChildId);
  }, [selectedChildId]);

  const handleRefresh = async () => {
    try {
      await Promise.all([fetchDashboard(), fetchLinkedChildren()]);
      if (selectedChildId) await fetchChildProgress(selectedChildId);
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  if (loading && !dashboardData && linkedChildren.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <p>{t('loading_dashboard', 'Loading dashboard\u2026')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1>{t('parent_dashboard', 'Parent Dashboard')}</h1>
        <button onClick={handleRefresh} className={styles.refreshBtn} disabled={loading}>
          {loading ? 'Refreshing\u2026' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={clearError}>{t('dismiss', 'Dismiss')}</button>
        </div>
      )}

      {/* \u2500\u2500 No children linked \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
      {linkedChildren.length === 0 ? (
        <div className={styles.emptyState} style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>👨‍👩‍👧</div>
          <h2 style={{ marginBottom: 12 }}>
            {t('no_children_linked', 'No children linked yet')}
          </h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.6 }}>
            {t(
              'link_child_explainer',
              'Once you link your child\'s account you\'ll see their activity progress, upcoming sessions, competency scores, submitted evidence, and teacher feedback \u2014 all in one place.'
            )}
          </p>
          <div style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '20px 24px',
            maxWidth: 480,
            margin: '0 auto 32px',
            textAlign: 'left',
          }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>{t('pages_parentdashboard.what_youll_see_after_linking', 'What you\'ll see after linking:')}</p>
            <ul style={{ color: 'var(--text-muted)', lineHeight: 2, paddingLeft: 20, margin: 0 }}>
              <li>{t('pages_parentdashboard.overall_progress_amp_competency_scores', '📊 Overall progress &amp; competency scores')}</li>
              <li>{t('pages_parentdashboard.active_and_completed_activities', '📚 Active and completed activities')}</li>
              <li>{t('pages_parentdashboard.upcoming_sessions_and_due_dates', '🗓️ Upcoming sessions and due dates')}</li>
              <li>{t('pages_parentdashboard.submitted_evidence_and_field_notes', '📸 Submitted evidence and field notes')}</li>
              <li>{t('pages_parentdashboard.teacher_feedback_and_messages', '💬 Teacher feedback and messages')}</li>
              <li>{t('pages_parentdashboard.downloadable_progress_reports', '📋 Downloadable progress reports')}</li>
            </ul>
          </div>
          <button
            onClick={() => navigate('/parent/link-child')}
            className={styles.createBtn}
            style={{ padding: '12px 32px', fontSize: '1rem' }}
          >
            🔗 {t('link_your_child', 'Link Your Child')}
          </button>
        </div>
      ) : (
        <>
          {/* \u2500\u2500 Child selector \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          <section className={styles.childrenSelector}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2>{t('your_children', 'Your Children')} ({linkedChildren.length})</h2>
              <button
                onClick={() => navigate('/parent/link-child')}
                className={styles.refreshBtn}
                style={{ fontSize: '0.8rem' }}
              >
                + {t('add_child', 'Add Child')}
              </button>
            </div>
            <div className={styles.childrenList}>
              {linkedChildren.map((child) => (
                <button
                  key={child.id}
                  className={`${styles.childButton} ${selectedChildId === child.id ? styles.selected : ''}`}
                  onClick={() => selectChild(child.id)}
                  disabled={!child.verified}
                >
                  <div className={styles.childName}>{child.full_name}</div>
                  <div className={styles.childGrade}>{t('grade', 'Grade')} {child.grade_level}</div>
                  {!child.verified && <span className={styles.pending}>{t('pending', 'Pending')}</span>}
                </button>
              ))}
            </div>
          </section>

          {/* \u2500\u2500 Quick links \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          <section className={styles.section}>
            <div className={styles.navGrid}>
              {[
                { icon: '\uD83D\uDCCA', label: 'Progress Reports', path: '/parent/progress' },
                { icon: '\uD83D\uDCAC', label: 'Messages',         path: '/parent/messages' },
                { icon: '\uD83D\uDCCB', label: 'Reports',          path: '/parent/reports' },
                { icon: '\uD83D\uDD14', label: 'Notifications',    path: '/parent/notifications' },
              ].map(({ icon, label, path }) => (
                <button key={path} onClick={() => navigate(path)} className={styles.navCard}>
                  {icon} {label}
                </button>
              ))}
            </div>
          </section>

          {/* \u2500\u2500 Selected child detail \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */}
          {selectedChildId && childProgress ? (
            <>
              <section className={styles.statsSection}>
                <h2>{childProgress.student_name} \u2014 {t('progress_overview', 'Progress Overview')}</h2>
                <div className={styles.progressCard}>
                  <div className={styles.progressItem}>
                    <div className={styles.label}>{t('overall_progress', 'Overall Progress')}</div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${childProgress.overall_progress}%` }} />
                    </div>
                    <div className={styles.percentage}>{childProgress.overall_progress}%</div>
                  </div>
                </div>

                {childProgress.competencies?.length > 0 && (
                  <div className={styles.competenciesSection}>
                    <h3>{t('competencies', 'Competencies')}</h3>
                    <div className={styles.competenciesList}>
                      {childProgress.competencies.map((comp) => (
                        <div key={comp.competency_id} className={styles.competencyItem}>
                          <div className={styles.competencyName}>{comp.competency_name}</div>
                          <div className={styles.competencyStatus}>{comp.status}</div>
                          <div className={styles.progressBar}>
                            <div className={styles.progressFill} style={{ width: `${comp.progress}%` }} />
                          </div>
                          <div className={styles.percentage}>{comp.progress}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {childProgress.activities?.length > 0 && (
                <section className={styles.section}>
                  <h3>{t('current_activities', 'Current Activities')} ({childProgress.activities.length})</h3>
                  <div className={styles.activitiesList}>
                    {childProgress.activities.map((activity) => (
                      <div key={activity.id} className={styles.activityCard}>
                        <h4>{activity.title}</h4>
                        <p className={styles.description}>{activity.description}</p>
                        <div className={styles.meta}>
                          <span>{activity.subject}</span>
                          <span>{activity.location}</span>
                        </div>
                        <div className={styles.dueDate}>{t('due', 'Due:')} {fmtDate(activity.due_date)}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {childProgress.recent_evidence?.length > 0 && (
                <section className={styles.section}>
                  <h3>{t('recent_evidence', 'Recent Evidence')} ({childProgress.recent_evidence.length})</h3>
                  <div className={styles.evidenceList}>
                    {childProgress.recent_evidence.slice(0, 5).map((evidence) => (
                      <div key={evidence.id} className={styles.evidenceItem}>
                        <div className={styles.evidenceType}>{evidence.capture_type}</div>
                        <div className={styles.evidenceInfo}>
                          <p>{evidence.description || 'No description'}</p>
                          <small>{fmtDate(evidence.created_at)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className={styles.emptyState} style={{ textAlign: 'center', padding: '32px' }}>
              <p style={{ color: 'var(--text-muted)' }}>
                {t('select_child_prompt', 'Select a child above to view their progress.')}
              </p>
            </div>
          )}
        </>
      )}

      {/* Parental Consent Status — shown whenever children are linked */}
      {linkedChildren.length > 0 && (
        <ConsentStatusPanel linkedChildren={linkedChildren} />
      )}
    </div>
  );
};

export default ParentDashboard;
