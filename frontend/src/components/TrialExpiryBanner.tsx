// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * TrialExpiryBanner
 *
 * Slim dismissible banner shown inside the dashboard shell when the calling
 * user's org is a few days from the end of its free trial (or already in the
 * post-trial grace period). Drives traffic to the website to subscribe —
 * mobile apps deliberately don't sell in-app, so checkout always happens on
 * the web (see billing routes + SAAS_DESIGN.md).
 *
 * Data source: GET /api/v1/billing/status  →  { trial_active, trial_days_left,
 *              grace_period, grace_days_left, license_tier }
 *
 * Visibility rules:
 *   - trial_active && trial_days_left <= SHOW_WITHIN_DAYS   → reminder
 *   - grace_period                                          → stronger notice
 *   - otherwise hidden
 *
 * Dismissal is per-day (localStorage), so it reappears each day the trial is
 * still winding down but never nags within a single day.
 */

import React, { useEffect, useState } from 'react';

const SHOW_WITHIN_DAYS = 7;
const PRICING_URL = '/licensing';

interface BillingStatus {
  license_tier?: string;
  license_status?: string;
  trial_active?: boolean;
  trial_days_left?: number | null;
  grace_period?: boolean;
  grace_days_left?: number | null;
}

function authHeader(): Record<string, string> {
  try {
    const tok = localStorage.getItem('auth_token');
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  } catch {
    return {};
  }
}

const todayKey = () => `trial_banner_dismissed_${new Date().toISOString().slice(0, 10)}`;

const TrialExpiryBanner: React.FC = () => {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(todayKey()) === '1'; } catch { return false; }
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/billing/status', { headers: { ...authHeader() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setStatus(data); })
      .catch(() => { /* silent — a billing hiccup must never block the app */ });
    return () => { cancelled = true; };
  }, []);

  if (dismissed || !status) return null;

  const inGrace = !!status.grace_period;
  const daysLeftTrial =
    status.trial_active && typeof status.trial_days_left === 'number'
      ? status.trial_days_left
      : null;

  const showReminder = daysLeftTrial !== null && daysLeftTrial <= SHOW_WITHIN_DAYS;
  if (!inGrace && !showReminder) return null;

  const graceDays =
    typeof status.grace_days_left === 'number' ? status.grace_days_left : null;

  const message = inGrace
    ? (graceDays !== null && graceDays > 0
        ? `Your free trial has ended. You have ${graceDays} day${graceDays === 1 ? '' : 's'} of grace access left — subscribe to keep your activities, reports and student accounts.`
        : 'Your free trial has ended. Subscribe now to keep your activities, reports and student accounts.')
    : (daysLeftTrial === 0
        ? 'Your free trial ends today. Subscribe to keep full access.'
        : `Your free trial ends in ${daysLeftTrial} day${daysLeftTrial === 1 ? '' : 's'}. Subscribe to keep full access.`);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(todayKey(), '1'); } catch { /* ignore */ }
  };

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
        background: inGrace ? '#fef2f2' : '#fffbeb',
        border: `1px solid ${inGrace ? '#fecaca' : '#fde68a'}`,
        color: inGrace ? '#991b1b' : '#92400e',
        borderRadius: '0.5rem', padding: '0.6rem 0.9rem',
        fontSize: '0.85rem', marginBottom: '1.25rem',
      }}
    >
      <span style={{ flex: '1 1 260px', lineHeight: 1.45 }}>{message}</span>
      <a
        href={PRICING_URL}
        style={{
          flexShrink: 0, textDecoration: 'none', fontWeight: 700,
          background: inGrace ? '#b91c1c' : '#b45309', color: '#fff',
          borderRadius: '0.35rem', padding: '0.4rem 0.9rem',
        }}
      >
        See plans
      </a>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
          color: 'inherit', fontSize: '1rem', lineHeight: 1, padding: '0.2rem 0.4rem',
        }}
      >
        ✕
      </button>
    </div>
  );
};

export default TrialExpiryBanner;
