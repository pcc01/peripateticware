// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Teacher Dashboard - Fully Wired with Zustand Stores & API Services
 * Displays: Activities, Students, Submissions, Classes, Summary Stats
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTeacherStore } from '@/stores';
import styles from './TeacherDashboard.module.css';
import { useAuthStore } from '@/stores/auth';
import { fmtDate } from '@/utils/date';

export const TeacherDashboard: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const {
    dashboardData,
    activities: storeActivities,
    loading,
    error,
    fetchDashboard,
    fetchActivities,
    clearError,
  } = useTeacherStore();

  const { logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Extract data safely — prefer dashboardData arrays, fall back to store arrays
  const activities = (dashboardData?.activities?.length ? dashboardData.activities : storeActivities) ?? [];
  const teacherClasses = dashboardData?.classes ?? [];
  const submissions = dashboardData?.recent_submissions ?? [];
  const students = dashboardData?.recent_students ?? [];

  // Compute "recent activity" stat from activities list
  const sortedByDate = [...activities].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const mostRecent = sortedByDate[0] ?? null;

  // One-week activity count
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activitiesThisWeek = activities.filter(
    (a) => new Date(a.created_at).getTime() >= oneWeekAgo
  ).length;

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([fetchDashboard(), fetchActivities()]);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
    };
    loadData();
  }, []);

  // Handle refresh
  const handleRefresh = async () => {
    try {
      await Promise.all([fetchDashboard(), fetchActivities()]);
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  if (loading && !dashboardData && activities.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <p>{t("landing:loading_dashboard", "Loading dashboard...")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1>{t("landing:teacher_dashboard", "Teacher Dashboard")}</h1>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={handleRefresh} className={styles.refreshBtn} disabled={loading}
            style={{ fontSize: '0.75rem', padding: '6px 14px' }}>
            {loading ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>
      
      {/* Error Message */}
      {error &&
      <div className={styles.error}>
          <p>{error}</p>
          <button onClick={clearError}>{t("landing:dismiss", "Dismiss")}</button>
        </div>
      }

      {/* Quick Stats */}
      <section className={styles.statsSection}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t("landing:total_students", "Total Students")}</div>
          <div className={styles.statValue}>
            {loading && !dashboardData ? '—' : (dashboardData?.total_students ?? '—')}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t("landing:teacherdashboard.classes", "Classes")}</div>
          <div className={styles.statValue}>
            {loading && !dashboardData ? '—' : (dashboardData?.total_classes ?? '—')}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t("landing:active_activities", "Active Activities")}</div>
          <div className={styles.statValue}>
            {loading && !dashboardData ? '—' : (dashboardData?.active_activities ?? activities.filter(a => a.status === 'active').length)}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t("landing:teacherdashboard.pending_submissions", "Pending Submissions")}</div>
          <div className={styles.statValue}>
            {loading && !dashboardData ? '—' : (dashboardData?.pending_submissions ?? '—')}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t("landing:teacherdashboard.total_activities", "Total Activities")}</div>
          <div className={styles.statValue}>
            {loading && activities.length === 0 ? '—' : activities.length}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>{t("landing:teacherdashboard.this_week", "This Week")}</div>
          <div className={styles.statValue}>
            {loading && activities.length === 0 ? '—' : `${activitiesThisWeek} ${activitiesThisWeek === 1 ? 'activity' : 'activities'}`}
          </div>
          {mostRecent && (
            <div style={{ fontSize: '0.7rem', color: 'inherit', opacity: 0.75, marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Last: {mostRecent.title} · {fmtDate(mostRecent.created_at)}
            </div>
          )}
        </div>
      </section>

      {/* Activities Section */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t("landing:your_activities", "Your Activities (")}{activities.length})</h2>
          <button
            onClick={() => navigate('/teacher/activities/new')}
            className={styles.createBtn}>{t("landing:teacherdashboard.create_activity", "+ Create Activity")}


          </button>
        </div>

        {activities.length === 0 ?
        <div className={styles.emptyState}>
            <p>{t("landing:no_activities_yet_create_your_first_one", "No activities yet. Create your first one!")}</p>
          </div> :

        <div className={styles.activitiesTable}>
            <table>
              <thead>
                <tr>
                  <th>{t("landing:teacherdashboard.title", "Title")}</th>
                  <th>{t("landing:subject", "Subject")}</th>
                  <th>{t("landing:teacherdashboard.status", "Status")}</th>
                  <th>{t("landing:teacherdashboard.students", "Students")}</th>
                  <th>{t("landing:teacherdashboard.submissions", "Submissions")}</th>
                  <th>{t("landing:actions", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) =>
              <tr key={activity.id}>
                    <td className={styles.title}>{activity.title}</td>
                    <td>{activity.subject}</td>
                    <td>
                      <span className={`${styles.status} ${styles[activity.status]}`}>
                        {activity.status}
                      </span>
                    </td>
                    <td>{activity.student_count || 0}</td>
                    <td>{activity.submissions_count || 0}</td>
                    <td className={styles.actions}>
                      <button onClick={() => navigate(`/teacher/activities/${activity.id}`)}>{t("landing:view", "View")}

                  </button>
                      <button onClick={() => navigate(`/teacher/activities/${activity.id}/edit`)}>{t("landing:teacherdashboard.edit", "Edit")}

                  </button>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }
      </section>

      {/* Pending Submissions */}
      {dashboardData?.recent_submissions && dashboardData.recent_submissions.length > 0 &&
      <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>{t("landing:teacherdashboard.pending_submissions", "Pending Submissions (")}{dashboardData.recent_submissions.length})</h2>
            <button onClick={() => navigate('/teacher/submissions')} className={styles.viewAllBtn}>{t("landing:view_all", "View All")}

          </button>
          </div>

          <div className={styles.submissionsList}>
            {dashboardData.recent_submissions.slice(0, 10).map((submission) =>
          <div key={submission.id} className={styles.submissionItem}>
                <div className={styles.submissionInfo}>
                  <h3>{submission.student_name}</h3>
                  <p className={styles.projectId}>{submission.project_id}</p>
                  <small>{t("landing:submitted", "Submitted:")}
                {fmtDate(submission.submitted_at)}
                  </small>
                </div>
                <span
              className={`${styles.submissionStatus} ${styles[submission.status]}`}>
              
                  {submission.status}
                </span>
                <button
              onClick={() => navigate(`/teacher/submissions/${submission.id}`)}
              className={styles.gradeBtn}>
              
                  {submission.status === 'submitted' ? 'Grade' : 'View'}
                </button>
              </div>
          )}
          </div>
        </section>
      }

      {/* Classes */}
      {teacherClasses.length > 0 &&
      <section className={styles.section}>
          <h2>{t("landing:your_classes", "Your Classes (")}{teacherClasses.length})</h2>
          <div className={styles.classesGrid}>
            {teacherClasses.map((cls) =>
          <div
            key={cls.id}
            className={styles.classCard}
            onClick={() => navigate(`/classes/${cls.id}`)}>
            
                <h3>{cls.name}</h3>
                <p>{cls.subject}</p>
                <div className={styles.classInfo}>
                  <span>{t("landing:teacherdashboard.grade", "Grade:")}{cls.grade_level}</span>
                  <span>{cls.student_count}{t("landing:teacherdashboard.students", "students")}</span>
                </div>
              </div>
          )}
          </div>
        </section>
      }

      {/* Students Overview */}
      {students.length > 0 &&
      <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>{t("landing:teacherdashboard.students", "Students (")}{students.length})</h2>
            <button onClick={() => navigate('/teacher/students')} className={styles.viewAllBtn}>{t("landing:view_all", "View All")}

          </button>
          </div>

          <div className={styles.studentsList}>
            {students.slice(0, 5).map((student: any) =>
          <div key={student.id} className={styles.studentItem}>
                <div className={styles.studentInfo}>
                  <h4>{student.full_name || student.username}</h4>
                  <p>{student.email}</p>
                </div>
                <button
              onClick={() => navigate(`/teacher/students/${student.id}`)}
              className={styles.viewBtn}>{t("landing:view_profile", "View Profile")}


            </button>
              </div>
          )}
          </div>
        </section>
      }
    </div>);

};

export default TeacherDashboard;