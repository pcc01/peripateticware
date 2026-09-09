// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * PlanCard
 *
 * Self-contained "Plan" section for the Homeschool and Teacher settings pages.
 * Shows the org's current plan + trial/grace status and, when not on a paid
 * plan, a monthly/yearly toggle and a Paddle checkout button (via UpgradeCTA).
 *
 * The 30-day free trial is the in-app experience (no card at signup); this
 * card is the path to actually subscribe when the user is ready. Paddle prices
 * carry no trial of their own — subscribing charges immediately.
 *
 * Price IDs are baked in at build time from VITE_PADDLE_PRICE_* (see
 * frontend/Dockerfile). Unset → UpgradeCTA falls back to a contact link.
 */

import React, { useEffect, useState } from 'react';
import UpgradeCTA from '../UpgradeCTA';

type Tier = 'homeschool' | 'teacher';

interface BillingStatus {
  license_tier?: string;
  license_status?: string;
  trial_active?: boolean;
  trial_days_left?: number | null;
  grace_period?: boolean;
  grace_days_left?: number | null;
  has_subscription?: boolean;
}

const PRICE_IDS: Record<Tier, { monthly?: string; yearly?: string; internalTier: string }> = {
  homeschool: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_HS_MONTHLY as string | undefined,
    yearly:  import.meta.env.VITE_PADDLE_PRICE_HS_YEARLY as string | undefined,
    internalTier: 'homeschool_family',
  },
  teacher: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_TEACHER_MONTHLY as string | undefined,
    yearly:  import.meta.env.VITE_PADDLE_PRICE_TEACHER_YEARLY as string | undefined,
    internalTier: 'starter',
  },
};

// Which internal license tiers count as "already on the paid plan" for each card.
const PAID_TIERS: Record<Tier, string[]> = {
  homeschool: ['homeschool_family', 'homeschool_coop'],
  teacher:    ['starter', 'school', 'school_byok', 'district', 'district_byok', 'enterprise'],
};

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 24, marginBottom: 20,
};

function authHeader(): Record<string, string> {
  try {
    const tok = localStorage.getItem('auth_token');
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  } catch {
    return {};
  }
}

const PlanCard: React.FC<{ tier: Tier }> = ({ tier }) => {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('yearly');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/billing/status', { headers: { ...authHeader() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setBilling(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!billing) return null;

  const currentTier = billing.license_tier || 'free';
  const onPaidPlan = PAID_TIERS[tier].includes(currentTier);
  const inGrace = !!billing.grace_period;

  const planLabel = (() => {
    if (onPaidPlan) return tier === 'homeschool' ? 'Homeschool (paid)' : 'Teacher (paid)';
    if (inGrace) {
      const d = billing.grace_days_left;
      return `Free trial ended${typeof d === 'number' ? ` — ${d} day${d === 1 ? '' : 's'} of grace access left` : ''}`;
    }
    if (billing.trial_active) {
      const d = billing.trial_days_left;
      return `Free trial${typeof d === 'number' ? ` — ${d} day${d === 1 ? '' : 's'} left` : ''}`;
    }
    return 'Free';
  })();

  const prices = PRICE_IDS[tier];
  const activePriceId = period === 'yearly' ? prices.yearly : prices.monthly;

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
    cursor: 'pointer', border: '1px solid var(--border)',
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text)',
  });

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700 }}>Plan</h2>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: '0.9rem', borderBottom: onPaidPlan ? 'none' : '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Current plan</span>
        <span style={{ fontWeight: 600 }}>{planLabel}</span>
      </div>

      {onPaidPlan ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 12 }}>
          Your subscription is active. Manage payment or cancel any time via the link in your Paddle receipt emails, or see our{' '}
          <a href="/refunds" style={{ color: 'var(--primary)' }}>refund &amp; cancellation policy</a>.
        </p>
      ) : (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            {inGrace
              ? 'Your free trial has ended. Subscribe to restore full access.'
              : 'Your 30-day free trial gives full access — no card needed. Subscribe whenever you’re ready.'}
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button style={btn(period === 'yearly')} onClick={() => setPeriod('yearly')}>
              Yearly&nbsp;·&nbsp;$99.99 <span style={{ opacity: 0.8, fontWeight: 500 }}>(save 30%)</span>
            </button>
            <button style={btn(period === 'monthly')} onClick={() => setPeriod('monthly')}>
              Monthly&nbsp;·&nbsp;$11.99
            </button>
          </div>

          <UpgradeCTA
            featureName={tier === 'homeschool' ? 'the Homeschool plan' : 'the Teacher plan'}
            requiredTier={prices.internalTier}
            currentTier={currentTier}
            paddlePriceId={activePriceId}
          />
        </div>
      )}
    </div>
  );
};

export default PlanCard;
