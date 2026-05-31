// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Parent Dashboard - Fully Wired with Zustand Stores & API Services
 * Displays: Linked Children, Child Progress, Child Activities
 * Child linking has its own page at /parent/link-child
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useParentStore } from '@/stores';
import styles from './ParentDashboard.module.css';
import { fmtDate } from '@/utils/date';

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
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67</div>
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
            <p style={{ fontWeight: 600, marginBottom: 8 }}>What you'll see after linking:</p>
            <ul style={{ color: 'var(--text-muted)', lineHeight: 2, paddingLeft: 20, margin: 0 }}>
              <li>\uD83D\uDCCA Overall progress &amp; competency scores</li>
              <li>\uD83D\uDCDA Active and completed activities</li>
              <li>\uD83D\uDDD3 Upcoming sessions and due dates</li>
              <li>\uD83D\uDCF8 Submitted evidence and field notes</li>
              <li>\uD83D\uDCAC Teacher feedback and messages</li>
              <li>\uD83D\uDCCB Downloadable progress reports</li>
            </ul>
          </div>
          <button
            onClick={() => navigate('/parent/link-child')}
            className={styles.createBtn}
            style={{ padding: '12px 32px', fontSize: '1rem' }}
          >
            \uD83D\uDD17 {t('link_your_child', 'Link Your Child')}
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
                { icon: '\uD83D\uDCC5', label: 'Calendar',         path: '/parent/calendar' },
                { icon: '\uD83D\uDCCB', label: 'Reports',          path: '/parent/reports' },
                { icon: '\uD83D\uDD14', label: 'Notifications',    path: '/parent/notifications' },
                { icon: '\u2699\uFE0F', label: 'Settings',         path: '/parent/settings' },
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
    </div>
  );
};

export default ParentDashboard;