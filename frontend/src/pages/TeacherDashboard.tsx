import { fmtDate, fmtDateTime, fmtTime } from '@/utils/date';
import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Teacher Dashboard - Fully Wired with Zustand Stores & API Services
 * Displays: Activities, Students, Submissions, Classes
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeacherStore } from '@/stores';
import styles from './TeacherDashboard.module.css';
import { useAuthStore } from '@/stores/auth';

export const TeacherDashboard: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const {
    dashboardData,
    loading,
    error,
    fetchDashboard,
    fetchActivities,
    fetchStudents,
    fetchClasses,
    fetchSubmissions,
    clearError
  } = useTeacherStore();

  const { logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Extract data safely from dashboardData
  const activities = dashboardData?.activities || [];
  const students = dashboardData?.recent_students || [];
  const teacherClasses = dashboardData?.classes || [];
  const submissions = dashboardData?.recent_submissions || [];

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([
        fetchDashboard(),
        fetchActivities(),
        fetchStudents(),
        fetchClasses(),
        fetchSubmissions()]
        );
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
    };

    loadData();
  }, []);

  // Handle refresh
  const handleRefresh = async () => {
    try {
      await Promise.all([
      fetchDashboard(),
      fetchActivities(),
      fetchStudents(),
      fetchClasses(),
      fetchSubmissions()]
      );
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
      {dashboardData &&
      <section className={styles.statsSection}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t("landing:total_students", "Total Students")}</div>
            <div className={styles.statValue}>{dashboardData.total_students}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t("landing:teacherdashboard.classes", "Classes")}</div>
            <div className={styles.statValue}>{dashboardData.total_classes}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t("landing:active_activities", "Active Activities")}</div>
            <div className={styles.statValue}>{dashboardData.active_activities}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t("landing:teacherdashboard.pending_submissions", "Pending Submissions")}</div>
            <div className={styles.statValue}>{dashboardData.pending_submissions}</div>
          </div>
        </section>
      }

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