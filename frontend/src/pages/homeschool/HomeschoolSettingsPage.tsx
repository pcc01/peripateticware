// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

export const HomeschoolSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 560 }}>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 32 }}>Settings</h1>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700 }}>Account</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Name</span>
            <span style={{ fontWeight: 600 }}>{user?.full_name || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Email</span>
            <span style={{ fontWeight: 600 }}>{user?.email || '—'}</span>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700 }}>Password</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 12 }}>Change your account password.</p>
        <button onClick={() => navigate('/forgot-password')}
          style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 500, fontSize: '0.88rem' }}>
          Reset Password
        </button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid #fecdd3', borderRadius: 14, padding: 24 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#be123c' }}>Sign Out</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 16 }}>You'll need to sign back in to access your dashboard.</p>
        <button onClick={handleLogout}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#be123c', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default HomeschoolSettingsPage;
