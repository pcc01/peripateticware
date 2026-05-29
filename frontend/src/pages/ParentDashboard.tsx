import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Parent Dashboard - Fully Wired with Zustand Stores & API Services
 * Displays: Linked Children, Child Progress, Child Activities
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParentStore } from '@/stores';
import styles from './ParentDashboard.module.css';
import { useAuthStore } from '@/stores/auth';

export const ParentDashboard: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [linkChildEmail, setLinkChildEmail] = useState('');

  const {
    dashboardData,
    selectedChildId,
    loading,
    error,
    fetchDashboard,
    fetchLinkedChildren,
    fetchChildProgress,
    linkChild,
    selectChild,
    clearError
  } = useParentStore();

  const { logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/');
  };
  // Extract data safely from dashboardData
  const linkedChildren = dashboardData?.linkedChildren || [];
  const childProgress = dashboardData?.child_progress || {};

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([fetchDashboard(), fetchLinkedChildren()]);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
    };

    loadData();
  }, []);

  // Load child progress when child is selected
  useEffect(() => {
    if (selectedChildId) {
      fetchChildProgress(selectedChildId);
    }
  }, [selectedChildId]);

  // Handle refresh
  const handleRefresh = async () => {
    try {
      await Promise.all([fetchDashboard(), fetchLinkedChildren()]);
      if (selectedChildId) {
        await fetchChildProgress(selectedChildId);
      }
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  // Handle link child
  const handleLinkChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkChildEmail) return;

    try {
      await linkChild(linkChildEmail);
      setLinkChildEmail('');
      // Select the newly linked child
      const updated = await useParentStore.getState().linkedChildren;
      if (updated.length > 0) {
        selectChild(updated[updated.length - 1].id);
      }
    } catch (err) {
      console.error('Failed to link child:', err);
    }
  };

  if (loading && !dashboardData) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <p>{t("landing:loading_dashboard", "Loading dashboard...")}</p>
        </div>
      </div>);

  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1>{t("landing:parent_dashboard", "Parent Dashboard")}</h1>
        <button onClick={handleRefresh} className={styles.refreshBtn} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      
      <button
        onClick={handleLogout}
        className={styles.logoutBtn}
        title={t("landing:parentdashboard.logout", "Logout")}>{t("landing:parentdashboard.logout", "\uD83D\uDEAA Logout")}


      </button>
      {/* Error Message */}
      {error &&
      <div className={styles.error}>
          <p>{error}</p>
          <button onClick={clearError}>{t("landing:dismiss", "Dismiss")}</button>
        </div>
      }

      {/* Link Child Section */}
      <section className={styles.linkChildSection}>
        <h2>{t("landing:link_your_child", "Link Your Child")}</h2>
        <form onSubmit={handleLinkChild} className={styles.linkForm}>
          <input
            type="email"
            placeholder={t("landing:enter_your_childs_email_address", "Enter your child's email address")}
            value={linkChildEmail}
            onChange={(e) => setLinkChildEmail(e.target.value)}
            disabled={loading} />
          
          <button type="submit" disabled={loading || !linkChildEmail}>
            {loading ? 'Linking...' : 'Link Child'}
          </button>
        </form>
        <p className={styles.note}>{t("landing:well_send_a_verification_request_to_your", "We'll send a verification request to your child's email address.")}

        </p>
      </section>

      {/* Linked Children */}
      {linkedChildren.length === 0 ?
      <div className={styles.emptyState}>
          <p>{t("landing:no_children_linked_yet_link_your_child_a", "No children linked yet. Link your child above to get started!")}</p>
        </div> :

      <>
          {/* Children Selector */}
          <section className={styles.childrenSelector}>
            <h2>{t("landing:your_children", "Your Children (")}{linkedChildren.length})</h2>
            <div className={styles.childrenList}>
              {linkedChildren.map((child) =>
            <button
              key={child.id}
              className={`${styles.childButton} ${
              selectedChildId === child.id ? styles.selected : ''}`
              }
              onClick={() => selectChild(child.id)}
              disabled={!child.verified}>
              
                  <div className={styles.childName}>{child.full_name}</div>
                  <div className={styles.childGrade}>{t("landing:parentdashboard.grade", "Grade")}{child.grade_level}</div>
                  {!child.verified && <span className={styles.pending}>{t("landing:pending", "Pending")}</span>}
                </button>
            )}
            </div>
          </section>
            {/* Navigation Quick Links */}
            <section className={styles.section}>
              <h2>{t("landing:quick_links", "Quick Links")}</h2>
              <div className={styles.navGrid}>
                <button
              onClick={() => navigate('/parent/progress')}
              className={styles.navCard}>{t("landing:parentdashboard.progress_reports", "\uD83D\uDCCA Progress Reports")}


            </button>
                <button
              onClick={() => navigate('/parent/messages')}
              className={styles.navCard}>{t("landing:messages", "\uD83D\uDCAC Messages")}


            </button>
                <button
              onClick={() => navigate('/parent/calendar')}
              className={styles.navCard}>{t("landing:calendar", "\uD83D\uDCC5 Calendar")}


            </button>
                <button
              onClick={() => navigate('/parent/reports')}
              className={styles.navCard}>{t("landing:reports", "\uD83D\uDCCB Reports")}


            </button>
                <button
              onClick={() => navigate('/parent/notifications')}
              className={styles.navCard}>{t("landing:parentdashboard.notifications", "\uD83D\uDD14 Notifications")}


            </button>
                <button
              onClick={() => navigate('/parent/settings')}
              className={styles.navCard}>{t("landing:parentdashboard.settings", "\u2699\uFE0F Settings")}


            </button>
              </div>
            </section>
            <button
          onClick={() => navigate('/parent/settings')}
          className={styles.settingsBtn}
          title={t("landing:parentdashboard.settings", "Settings")}>{t("landing:parentdashboard.settings", "\u2699\uFE0F Settings")}


        </button>
          {/* Selected Child Progress */}
          {selectedChildId && childProgress &&
        <>
              {/* Overall Stats */}
              <section className={styles.statsSection}>
                <div className={styles.childHeader}>
                  <h2>{childProgress.student_name}{t("landing:progress_overview", "- Progress Overview")}</h2>
                </div>

                <div className={styles.progressCard}>
                  <div className={styles.progressItem}>
                    <div className={styles.label}>{t("landing:overall_progress", "Overall Progress")}</div>
                    <div className={styles.progressBar}>
                      <div
                    className={styles.progressFill}
                    style={{ width: `${childProgress.overall_progress}%` }} />
                  
                    </div>
                    <div className={styles.percentage}>{childProgress.overall_progress}%</div>
                  </div>
                </div>

                {/* Competencies */}
                {childProgress.competencies && childProgress.competencies.length > 0 &&
            <div className={styles.competenciesSection}>
                    <h3>{t("landing:competencies", "Competencies")}</h3>
                    <div className={styles.competenciesList}>
                      {childProgress.competencies.map((comp) =>
                <div key={comp.competency_id} className={styles.competencyItem}>
                          <div className={styles.competencyName}>{comp.competency_name}</div>
                          <div className={styles.competencyStatus}>{comp.status}</div>
                          <div className={styles.progressBar}>
                            <div
                      className={styles.progressFill}
                      style={{ width: `${comp.progress}%` }} />
                    
                          </div>
                          <div className={styles.percentage}>{comp.progress}%</div>
                        </div>
                )}
                    </div>
                  </div>
            }
              </section>

              {/* Activities */}
              {childProgress.activities && childProgress.activities.length > 0 &&
          <section className={styles.section}>
                  <h3>{t("landing:current_activities", "Current Activities (")}{childProgress.activities.length})</h3>
                  <div className={styles.activitiesList}>
                    {childProgress.activities.map((activity) =>
              <div key={activity.id} className={styles.activityCard}>
                        <h4>{activity.title}</h4>
                        <p className={styles.description}>{activity.description}</p>
                        <div className={styles.meta}>
                          <span>{activity.subject}</span>
                          <span>{activity.location}</span>
                        </div>
                        <div className={styles.dueDate}>{t("landing:due", "Due:")}
                  {new Date(activity.due_date).toLocaleDateString()}
                        </div>
                      </div>
              )}
                  </div>
                </section>
          }

              {/* Recent Evidence */}
              {childProgress.recent_evidence && childProgress.recent_evidence.length > 0 &&
          <section className={styles.section}>
                  <h3>{t("landing:recent_evidence", "Recent Evidence (")}{childProgress.recent_evidence.length})</h3>
                  <div className={styles.evidenceList}>
                    {childProgress.recent_evidence.slice(0, 5).map((evidence) =>
              <div key={evidence.id} className={styles.evidenceItem}>
                        <div className={styles.evidenceType}>{evidence.capture_type}</div>
                        <div className={styles.evidenceInfo}>
                          <p>{evidence.description || 'No description'}</p>
                          <small>{new Date(evidence.created_at).toLocaleDateString()}</small>
                        </div>
                      </div>
              )}
                  </div>
                </section>
          }
            </>
        }
        </>
      }
    </div>);

};

export default ParentDashboard;