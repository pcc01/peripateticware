// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useTranslation } from 'react-i18next';

interface Stats { child_count: number; activity_count: number; session_count: number; standards_count: number; }

function authHeader() {
  const t = localStorage.getItem('auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const StatCard: React.FC<{ icon: string; label: string; value: number; to: string; cta?: string }> = ({ icon, label, value, to, cta }) => {
  const navigate = useNavigate();
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${value}${cta && value === 0 ? '. ' + cta : ''}`}
      onClick={() => navigate(to)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(to); } }}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
      <div style={{ fontSize: '1.8rem', marginBottom: 8 }} aria-hidden="true">{icon}</div>
      <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>{label}</div>
      {value === 0 && cta && <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>{cta} →</div>}
    </div>
  );
};

export const HomeschoolDashboard: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If the user already dismissed onboarding locally, never redirect back to the
    // wizard (prevents the welcome ⇄ dashboard loop when the API doesn't persist it).
    const locallyDismissed = (() => {
      try { return localStorage.getItem('hs_onboarding_dismissed') === '1'; } catch { return false; }
    })();

    // Check onboarding status — redirect new homeschool users to wizard
    fetch('/api/v1/onboarding/status', { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!locallyDismissed && data && !data.dismissed && !data.all_done) {
          navigate('/homeschool/welcome');
          return;
        }
        fetch('/api/v1/homeschool/dashboard', { headers: authHeader() })
          .then(r => r.ok ? r.json() : null)
          .then(setStats)
          .finally(() => setLoading(false));
      })
      .catch(() => {
        // Fail open — load dashboard normally
        fetch('/api/v1/homeschool/dashboard', { headers: authHeader() })
          .then(r => r.ok ? r.json() : null)
          .then(setStats)
          .finally(() => setLoading(false));
      });
  }, []);

  const firstName = user?.full_name?.split(' ')[0] || 'there';

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 4 }}>Welcome, {firstName} 👋</h1>
        <p style={{ color: 'var(--text-muted)' }}>{t('pages_homeschool_homeschooldashboard.your_homeschool_at_a_glance', 'Your homeschool at a glance.')}</p>
      </div>

      {loading ? <p style={{ color: 'var(--text-muted)' }}>{t('pages_homeschool_homeschooldashboard.loading', 'Loading…')}</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 40 }}>
          <StatCard icon="👧" label="Children" value={stats?.child_count ?? 0} to="/homeschool/children" cta="Add a child" />
          <StatCard icon="📚" label="Activities" value={stats?.activity_count ?? 0} to="/homeschool/activities" cta="Create first activity" />
          <StatCard icon="🎯" label="Sessions" value={stats?.session_count ?? 0} to="/homeschool/progress" />
          <StatCard icon="📋" label="Standards Sets" value={stats?.standards_count ?? 0} to="/homeschool/requirements" cta="Import requirements" />
        </div>
      )}

      {/* Quick actions */}
      <h2 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 14 }}>{t('pages_homeschool_homeschooldashboard.quick_actions', 'Quick Actions')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {[
          { icon: '➕', label: 'New Activity',          path: '/homeschool/activities/new' },
          { icon: '👧', label: 'Manage Children',       path: '/homeschool/children' },
          { icon: '📊', label: 'View Progress',         path: '/homeschool/progress' },
          { icon: '📋', label: 'State Requirements',    path: '/homeschool/requirements' },
          { icon: '📈', label: 'Coverage Report',       path: '/homeschool/coverage' },
          { icon: '📥', label: 'Export Portfolio',      path: '/homeschool/export' },
        ].map(a => (
          <button key={a.path} onClick={() => navigate(a.path)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem', textAlign: 'left',
          }}>
            <span style={{ fontSize: '1.1rem' }}>{a.icon}</span> {a.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default HomeschoolDashboard;
