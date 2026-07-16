// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1
//
// Shown when the backend is in maintenance mode (503 + detail "maintenance").
// The axios interceptor in services/api.ts redirects here. Auto-retries the
// app every 60 seconds; platform admins can still reach /platform to toggle
// maintenance off (that surface is exempt from the 503).

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const RETRY_SECONDS = 60;

export default function MaintenancePage() {
  const { t } = useTranslation('landing');
  const [countdown, setCountdown] = useState(RETRY_SECONDS);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          window.location.href = '/';
          return RETRY_SECONDS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg, #f9f6f1)', padding: '1.5rem',
    }}>
      <div style={{ maxWidth: '480px', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧭</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text, #1f2937)', marginBottom: '0.75rem' }}>{t('pages_maintenancepage.down_for_maintenance', 'Down for maintenance')}</h1>
        <p style={{ color: 'var(--text-muted, #6b7280)', lineHeight: 1.7, marginBottom: '1.5rem' }}>{t('pages_maintenancepage.peripateticware_is_briefly_offline_while', 'Peripateticware is briefly offline while we make improvements. Your work is safe — we\'ll be back shortly.')}</p>
        <button
          onClick={() => { window.location.href = '/'; }}
          style={{
            background: 'var(--primary, #1b4332)', color: '#fff', border: 'none',
            borderRadius: '0.6rem', padding: '0.7rem 1.5rem', fontWeight: 600,
            fontSize: '0.9rem', cursor: 'pointer',
          }}
        >
          Try again now
        </button>
        <p style={{ color: 'var(--text-faint, #9ca3af)', fontSize: '0.8rem', marginTop: '1rem' }}>
          Retrying automatically in {countdown}s
        </p>
      </div>
    </div>
  );
}
