// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface Analytics {
  active_users: number; completed_sessions: number;
  storage_used_mb: number; api_requests_today: number;
}
interface DashboardData {
  users_count: number; activities_count: number; sessions_count: number;
  analytics: { total_teachers: number; total_students: number; total_parents: number; system_uptime: number; average_session_attendance: number; database_size: string; };
}

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const Stat: React.FC<{ label: string; value: string | number; sub?: string; color?: string; to?: string }> = ({ label, value, sub, color, to }) => {
  const navigate = useNavigate();
  const clickable = !!to;
  return (
    <div
      onClick={clickable ? () => navigate(to!) : undefined}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', cursor: clickable ? 'pointer' : 'default', transition: 'box-shadow 0.15s' }}
      onMouseEnter={clickable ? (e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')) : undefined}
      onMouseLeave={clickable ? (e => (e.currentTarget.style.boxShadow = 'none')) : undefined}
    >
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>{sub}</div>}
      {clickable && <div style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, marginTop: 8 }}>View →</div>}
    </div>
  );
};

export const AdminAnalyticsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/admin/analytics', { headers: authHeader() }).then(r => r.json()),
      fetch('/api/v1/admin/dashboard', { headers: authHeader() }).then(r => r.json()),
    ]).then(([a, d]) => { setAnalytics(a); setDashboard(d); })
      .finally(() => setLoading(false));
  }, []);

  const a = analytics;
  const d = dashboard;

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      {/* Header is always rendered so tests (and users) see the h1 immediately */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>← Dashboard</button>
        <h1 style={{ fontFamily: 'var(--font-head)', margin: 0 }}>{t('pages_admin_adminanalyticspage.analytics', 'Analytics')}</h1>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('pages_admin_adminanalyticspage.loading', 'Loading…')}</p>
      ) : (
        <>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>{t('pages_admin_adminanalyticspage.user_overview', 'User Overview')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
            <Stat label="Total Users" value={d?.users_count ?? 0} to="/admin/users" />
            <Stat label="Teachers" value={d?.analytics?.total_teachers ?? 0} color="var(--primary)" to="/admin/users?role=TEACHER" />
            <Stat label="Students" value={d?.analytics?.total_students ?? 0} color="#0284c7" to="/admin/users?role=STUDENT" />
            <Stat label="Parents" value={d?.analytics?.total_parents ?? 0} color="#b45309" to="/admin/users?role=PARENT" />
          </div>

          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>{t('pages_admin_adminanalyticspage.activity_sessions', 'Activity & Sessions')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
            <Stat label="Total Activities" value={d?.activities_count ?? 0} />
            <Stat label="Total Sessions" value={d?.sessions_count ?? 0} />
            <Stat label="Completed Sessions" value={a?.completed_sessions ?? 0} />
            <Stat label="Avg Attendance" value={`${d?.analytics?.average_session_attendance ?? 0}%`} />
          </div>

          <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 16 }}>{t('pages_admin_adminanalyticspage.system_health', 'System Health')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <Stat label="Active Users" value={a?.active_users ?? 0} color="#16a34a" />
            <Stat label="System Uptime" value={`${d?.analytics?.system_uptime ?? 100}%`} color="#16a34a" />
            <Stat label="Database Size" value={d?.analytics?.database_size ?? 'N/A'} />
            <Stat label="API Requests Today" value={a?.api_requests_today ?? 0} sub="Live data coming soon" />
          </div>
        </>
      )}
    </div>
  );
};

export default AdminAnalyticsPage;
