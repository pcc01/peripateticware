import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Admin Dashboard - Fully Wired with Zustand Stores & API Services
 * Displays: Users, Analytics, System Statistics
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminStore } from '@/stores';
import * as Types from '@/types';
import styles from './AdminDashboard.module.css';
import { useAuthStore } from '@/stores/auth';

export const AdminDashboard: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [newUserData, setNewUserData] = useState<Types.SignupRequest>({
    email: '',
    password: '',
    full_name: '',
    role: 'STUDENT'
  });

  const {
    dashboardData,
    loading,
    error,
    fetchDashboard,
    fetchUsers,
    fetchAnalytics,
    createUser,
    deleteUser,
    clearError
  } = useAdminStore();

  const { logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/');
  };
  // Extract data safely from dashboardData
  const users = dashboardData?.recent_users || [];
  const analytics = dashboardData?.analytics || {};
  const pagination = dashboardData?.pagination || { total: 0, limit: 20, offset: 0 };

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([fetchDashboard(), fetchUsers(0, 20), fetchAnalytics()]);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
    };

    loadData();
  }, []);

  // Handle refresh
  const handleRefresh = async () => {
    try {
      await Promise.all([fetchDashboard(), fetchUsers(0, 20), fetchAnalytics()]);
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  // Handle create user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(newUserData);
      setNewUserData({ email: '', password: '', full_name: '', role: 'STUDENT' });
      setShowCreateUserForm(false);
      await fetchUsers(0, 20);
    } catch (err) {
      console.error('Failed to create user:', err);
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await deleteUser(userId);
      await fetchUsers(0, 20);
    } catch (err) {
      console.error('Failed to delete user:', err);
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
      <button
        onClick={() => navigate('/admin/settings')}
        className={styles.settingsBtn}
        title={t("landing:admindashboard.settings", "Settings")}>{t("landing:admindashboard.settings", "\u2699\uFE0F Settings")}


      </button>
      
      <div className={styles.header}>
        <h1>{t("landing:admin_dashboard", "Admin Dashboard")}</h1>
        <button onClick={handleRefresh} className={styles.refreshBtn} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <button
        onClick={handleLogout}
        className={styles.logoutBtn}
        title={t("landing:admindashboard.logout", "Logout")}>{t("landing:admindashboard.logout", "\uD83D\uDEAA Logout")}


      </button>
      {/* Error Message */}
      {error &&
      <div className={styles.error}>
          <p>{error}</p>
          <button onClick={clearError}>{t("landing:dismiss", "Dismiss")}</button>
        </div>
      }

      {/* System Statistics */}
      {dashboardData &&
      <section className={styles.statsSection}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t("landing:total_users", "Total Users")}</div>
            <div className={styles.statValue}>{dashboardData.users_count}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t("landing:total_activities", "Total Activities")}</div>
            <div className={styles.statValue}>{dashboardData.activities_count}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{t("landing:total_sessions", "Total Sessions")}</div>
            <div className={styles.statValue}>{dashboardData.sessions_count}</div>
          </div>
        </section>
      }

      {/* Analytics */}
      {analytics &&
      <section className={styles.section}>
          <h2>{t("landing:system_analytics", "System Analytics")}</h2>
          <div className={styles.analyticsGrid}>
            <div className={styles.analyticsCard}>
              <h3>{t("landing:user_breakdown", "User Breakdown")}</h3>
              <div className={styles.statItem}>
                <span>{t("landing:teachers", "Teachers")}</span>
                <span className={styles.value}>{analytics.total_teachers || 0}</span>
              </div>
              <div className={styles.statItem}>
                <span>{t("landing:admindashboard.students", "Students")}</span>
                <span className={styles.value}>{analytics.total_students || 0}</span>
              </div>
              <div className={styles.statItem}>
                <span>{t("landing:parents", "Parents")}</span>
                <span className={styles.value}>{analytics.total_parents || 0}</span>
              </div>
            </div>

            <div className={styles.analyticsCard}>
              <h3>{t("landing:admindashboard.system_health", "System Health")}</h3>
              <div className={styles.statItem}>
                <span>{t("landing:uptime", "Uptime")}</span>
                <span className={styles.value}>{analytics.system_uptime || 0}%</span>
              </div>
              <div className={styles.statItem}>
                <span>{t("landing:avg_session_attendance", "Avg Session Attendance")}</span>
                <span className={styles.value}>{analytics.average_session_attendance || 0}%</span>
              </div>
              <div className={styles.statItem}>
                <span>{t("landing:database_size", "Database Size")}</span>
                <span className={styles.value}>{analytics.database_size || 'N/A'}</span>
              </div>
            </div>
          </div>
        </section>
      }

      {/* Users Management */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>{t("landing:admindashboard.user_management", "User Management (")}{pagination.total})</h2>
          <button
            onClick={() => setShowCreateUserForm(!showCreateUserForm)}
            className={styles.createBtn}>
            
            {showCreateUserForm ? 'Cancel' : '+ Create User'}
          </button>
        </div>

        {/* Create User Form */}
        {showCreateUserForm &&
        <form onSubmit={handleCreateUser} className={styles.createForm}>
            <div className={styles.formGroup}>
              <label>{t("landing:email", "Email")}</label>
              <input
              type="email"
              required
              value={newUserData.email}
              onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })} />
            
            </div>

            <div className={styles.formGroup}>
              <label>{t("landing:full_name", "Full Name")}</label>
              <input
              type="text"
              value={newUserData.full_name || ''}
              onChange={(e) => setNewUserData({ ...newUserData, full_name: e.target.value })} />
            
            </div>

            <div className={styles.formGroup}>
              <label>{t("landing:password", "Password")}</label>
              <input
              type="password"
              required
              value={newUserData.password}
              onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })} />
            
            </div>

            <div className={styles.formGroup}>
              <label>{t("landing:role", "Role")}</label>
              <select
              value={newUserData.role}
              onChange={(e) =>
              setNewUserData({
                ...newUserData,
                role: e.target.value as 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN'
              })
              }>
              
                <option value="STUDENT">{t("landing:admindashboard.student", "Student")}</option>
                <option value="TEACHER">{t("landing:admindashboard.teacher", "Teacher")}</option>
                <option value="PARENT">{t("landing:admindashboard.parent", "Parent")}</option>
                <option value="ADMIN">{t("landing:admin", "Admin")}</option>
              </select>
            </div>

            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </form>
        }

        {/* Users Table */}
        {users.length === 0 ?
        <div className={styles.emptyState}>
            <p>{t("landing:no_users_found", "No users found.")}</p>
          </div> :

        <div className={styles.usersTable}>
            <table>
              <thead>
                <tr>
                  <th>{t("landing:email", "Email")}</th>
                  <th>{t("landing:name", "Name")}</th>
                  <th>{t("landing:role", "Role")}</th>
                  <th>{t("landing:admindashboard.status", "Status")}</th>
                  <th>{t("landing:actions", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) =>
              <tr key={user.id}>
                    <td>{user.email}</td>
                    <td>{user.full_name || user.username || '-'}</td>
                    <td>
                      <span className={`${styles.role} ${styles[user.role.toLowerCase()]}`}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <span
                    className={`${styles.status} ${
                    user.is_active ? styles.active : styles.inactive}`
                    }>
                    
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className={styles.actions}>
                      <button onClick={() => navigate(`/admin/users`)}>{t("landing:view", "View")}

                  </button>
                      <button
                    onClick={() => handleDeleteUser(user.id)}
                    className={styles.deleteBtn}>{t("landing:delete", "Delete")}


                  </button>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        }

        {/* Pagination */}
        {pagination.total > 20 &&
        <div className={styles.pagination}>
            <p>{t("landing:showing", "Showing")}
            {users.length}{t("landing:of", "of")}{pagination.total}{t("landing:users", "users")}
          </p>
            <div className={styles.paginationButtons}>
              <button
              onClick={() => fetchUsers(Math.max(0, pagination.skip - 20), 20)}
              disabled={pagination.skip === 0}>{t("landing:admindashboard.previous", "Previous")}


            </button>
              <button
              onClick={() => fetchUsers(pagination.skip + 20, 20)}
              disabled={pagination.skip + 20 >= pagination.total}>{t("landing:admindashboard.next", "Next")}


            </button>
            </div>
          </div>
        }
      </section>

      {/* Recent Users */}
      {dashboardData?.recent_users && dashboardData.recent_users.length > 0 &&
      <section className={styles.section}>
          <h2>{t("landing:recent_users", "Recent Users")}</h2>
          <div className={styles.usersList}>
            {dashboardData.recent_users.map((user) =>
          <div key={user.id} className={styles.userItem}>
                <div className={styles.userInfo}>
                  <h4>{user.full_name || user.username}</h4>
                  <p>{user.email}</p>
                </div>
                <span className={`${styles.role} ${styles[user.role.toLowerCase()]}`}>
                  {user.role}
                </span>
              </div>
          )}
          </div>
        </section>
      }
      {/* Admin Navigation */}
      <section className={styles.section}>
        <h2>{t("landing:admin_tools", "Admin Tools")}</h2>
        <div className={styles.adminNav}>
          <button
            onClick={() => navigate('/admin/users')}
            className={styles.navCard}>{t("landing:admindashboard.user_management", "\uD83D\uDC65 User Management")}


          </button>
          <button
            onClick={() => navigate('/admin/classes')}
            className={styles.navCard}>{t("landing:admindashboard.classes", "\uD83C\uDFEB Classes")}


          </button>
          <button
            onClick={() => navigate('/admin/system')}
            className={styles.navCard}>{t("landing:admindashboard.system_health", "\uD83D\uDDA5\uFE0F System Health")}


          </button>
          <button
            onClick={() => navigate('/admin/privacy')}
            className={styles.navCard}>{t("landing:privacy_config", "\uD83D\uDD12 Privacy Config")}


          </button>
          <button
            onClick={() => navigate('/admin/logs')}
            className={styles.navCard}>{t("landing:audit_logs", "\uD83D\uDCCB Audit Logs")}


          </button>
          <button
            onClick={() => navigate('/admin/analytics')}
            className={styles.navCard}>{t("landing:admindashboard.analytics", "\uD83D\uDCCA Analytics")}


          </button>
          <button
            onClick={() => navigate('/admin/settings')}
            className={styles.navCard}>{t("landing:admindashboard.settings", "\u2699\uFE0F Settings")}


          </button>
          <button
            onClick={() => navigate('/admin/help')}
            className={styles.navCard}>{t("landing:help", "\u2753 Help")}


          </button>
        </div>
      </section>
    </div>);

};

export default AdminDashboard;