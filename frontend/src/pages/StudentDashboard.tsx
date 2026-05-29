import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Student Dashboard - Fully Wired with Zustand Stores & API Services
 * Displays: Progress, Projects, Activities, Upcoming Sessions
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudentStore } from '@/stores';
import styles from './StudentDashboard.module.css';
import { useAuthStore } from '@/stores/auth';
export const StudentDashboard: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const {
    dashboardData,
    loading,
    error,
    fetchDashboard,
    fetchActiveProjects,
    fetchActivities,
    clearError
  } = useStudentStore();

  const { logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/');
  };
  // Extract data safely from dashboardData
  const activeProjects = dashboardData?.active_projects || [];
  const activities = dashboardData?.recent_activities || [];

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([fetchDashboard(), fetchActiveProjects(), fetchActivities()]);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
    };

    loadData();
  }, []);

  // Handle refresh
  const handleRefresh = async () => {
    try {
      await Promise.all([fetchDashboard(), fetchActiveProjects(), fetchActivities()]);
    } catch (err) {
      console.error('Refresh failed:', err);
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
        <h1>{t("landing:student_dashboard", "Student Dashboard")}</h1>
        <button onClick={handleRefresh} className={styles.refreshBtn} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <button
        onClick={() => navigate('/student/settings')}
        className={styles.settingsBtn}
        title={t("landing:studentdashboard.settings", "Settings")}>{t("landing:studentdashboard.settings", "\u2699\uFE0F Settings")}


      </button>

      <button
        onClick={handleLogout}
        className={styles.logoutBtn}
        title={t("landing:studentdashboard.logout", "Logout")}>{t("landing:studentdashboard.logout", "\uD83D\uDEAA Logout")}


      </button>

      {/* Error Message */}
      {error &&
      <div className={styles.error}>
          <p>{error}</p>
          <button onClick={clearError}>{t("landing:dismiss", "Dismiss")}</button>
        </div>

      }

      

      {/* Overall Progress Card */}
      {dashboardData &&
      <section className={styles.progressSection}>
          <h2>{t("landing:your_progress", "Your Progress")}</h2>
          <div className={styles.progressCard}>
            <div className={styles.progressItem}>
              <div className={styles.label}>{t("landing:overall_progress", "Overall Progress")}</div>
              <div className={styles.progressBar}>
                <div
                className={styles.progressFill}
                style={{
                  width: `${dashboardData.progress?.[0]?.overall_progress || 0}%`
                }} />
              
              </div>
              <div className={styles.percentage}>
                {dashboardData.progress?.[0]?.overall_progress || 0}%
              </div>
            </div>
          </div>
        </section>
      }

      {/* Active Projects */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t("landing:active_projects", "Active Projects (")}{activeProjects.length})</h2>
          <button onClick={() => navigate('/student/activities')} className={styles.viewAllBtn}>{t("landing:view_all", "View All")}

          </button>
        </div>

        {activeProjects.length === 0 ?
        <div className={styles.emptyState}>
            <p>{t("landing:no_active_projects_yet_check_available_a", "No active projects yet. Check available activities!")}</p>
          </div> :

        <div className={styles.projectGrid}>
            {activeProjects.map((project) =>
          <div
            key={project.id}
            className={styles.projectCard}
            onClick={() => navigate(`/student/activities/${project.id}`)}>
            
                <h3>{project.title}</h3>
                <p className={styles.description}>{project.description}</p>
                <div className={styles.meta}>
                  <span>{t("landing:studentdashboard.progress", "Progress:")}{project.progress}%</span>
                  <span>{project.submissions_count}{t("landing:studentdashboard.submissions", "submissions")}</span>
                </div>
                <div className={styles.progressBar}>
                  <div
                className={styles.progressFill}
                style={{ width: `${project.progress}%` }} />
              
                </div>
              </div>
          )}
          </div>
        }
      </section>

      {/* Upcoming Sessions */}
      {dashboardData?.upcoming_sessions && dashboardData.upcoming_sessions.length > 0 &&
      <section className={styles.section}>
          <h2>{t("landing:studentdashboard.upcoming_sessions", "Upcoming Sessions (")}{dashboardData.upcoming_sessions.length})</h2>
          <div className={styles.sessionsList}>
            {dashboardData.upcoming_sessions.map((session) =>
          <div
            key={session.id}
            className={styles.sessionItem}
            onClick={() => navigate(`/student/activities/${session.id}`)}>
            
                <div className={styles.sessionInfo}>
                  <h3>{session.title}</h3>
                  <p>{session.location}</p>
                  <p className={styles.time}>
                    {new Date(session.start_time).toLocaleString()}
                  </p>
                </div>
                <button className={styles.joinBtn}>{t("landing:view_details", "View Details")}</button>
              </div>
          )}
          </div>
        </section>
      }

      {/* Available Activities */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t("landing:available_activities", "Available Activities (")}{activities.length})</h2>
          <button onClick={() => navigate('/student/activities')} className={styles.viewAllBtn}>{t("landing:browse_all", "Browse All")}

          </button>
        </div>

        {activities.length === 0 ?
        <div className={styles.emptyState}>
            <p>{t("landing:no_activities_available_at_this_time", "No activities available at this time.")}</p>
          </div> :

        <div className={styles.activitiesGrid}>
            {activities.slice(0, 3).map((activity) =>
          <div
            key={activity.id}
            className={styles.activityCard}
            onClick={() => navigate(`/student/activities/${activity.id}`)}>
            
                <div className={styles.activityHeader}>
                  <h3>{activity.title}</h3>
                  <span className={`${styles.status} ${styles[activity.status]}`}>
                    {activity.status}
                  </span>
                </div>
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
        }
      </section>

      {/* Recent Evidence */}
      {dashboardData?.recent_evidence && dashboardData.recent_evidence.length > 0 &&
      <section className={styles.section}>
          <h2>{t("landing:recent_evidence", "Recent Evidence (")}{dashboardData.recent_evidence.length})</h2>
          <div className={styles.evidenceList}>
            {dashboardData.recent_evidence.slice(0, 5).map((evidence) =>
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
    </div>);

};

export default StudentDashboard;