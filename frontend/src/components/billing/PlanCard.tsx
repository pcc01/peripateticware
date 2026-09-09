// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * PlanCard
 *
 * Self-contained "Plan" section for the Homeschool and Teacher settings pages.
 * Shows the org's current plan + trial/grace status and, when not on a paid
 * plan, a monthly/yearly toggle and a Paddle checkout button.
 *
 * The 30-day free trial is the in-app experience (no card at signup); this
 * card is the path to actually subscribe when the user is ready. Paddle prices
 * carry no trial of their own — subscribing charges immediately.
 *
 * Deliberately uses inline styles + CSS custom properties (not Tailwind), to
 * match the settings pages and sidestep the global `button {}` rule in
 * design-system.css that overrides utility padding / white-space.
 *
 * Price IDs are baked in at build time from VITE_PADDLE_PRICE_* (see
 * frontend/Dockerfile). Unset → the button falls back to a contact link.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/auth';

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

const PRICES: Record<Tier, {
  label: string;
  internalTier: string;
  monthly?: string;
  yearly?: string;
}> = {
  homeschool: {
    label: 'Homeschool',
    internalTier: 'homeschool_family',
    monthly: import.meta.env.VITE_PADDLE_PRICE_HS_MONTHLY as string | undefined,
    yearly:  import.meta.env.VITE_PADDLE_PRICE_HS_YEARLY as string | undefined,
  },
  teacher: {
    label: 'Teacher',
    internalTier: 'starter',
    monthly: import.meta.env.VITE_PADDLE_PRICE_TEACHER_MONTHLY as string | undefined,
    yearly:  import.meta.env.VITE_PADDLE_PRICE_TEACHER_YEARLY as string | undefined,
  },
};

const PAID_TIERS: Record<Tier, string[]> = {
  homeschool: ['homeschool_family', 'homeschool_coop'],
  teacher:    ['starter', 'school', 'school_byok', 'district', 'district_byok', 'enterprise'],
};

const CONTACT_MAILTO = 'mailto:hello@peripateticware.com?subject=Subscription%20enquiry';

declare global {
  interface Window {
    Paddle?: {
      Initialize: (opts: { token: string }) => void;
      Checkout: {
        open: (opts: {
          items: { priceId: string; quantity: number }[];
          customData?: Record<string, string>;
          customer?: { email?: string };
        }) => void;
      };
      Environment: { set: (env: string) => void };
    };
  }
}

function authHeader(): Record<string, string> {
  try {
    const tok = localStorage.getItem('auth_token');
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  } catch {
    return {};
  }
}

/** Load Paddle.js once and initialise it from the build-time env. */
function usePaddleReady(): boolean {
  const [ready, setReady] = useState(!!window.Paddle);
  const started = useRef(false);
  useEffect(() => {
    if (window.Paddle) { setReady(true); return; }
    if (started.current) return;
    started.current = true;
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.async = true;
    s.onload = () => {
      try {
        const env = (import.meta.env.VITE_PADDLE_ENVIRONMENT as string) || 'production';
        const token = (import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string) || '';
        if (env === 'sandbox') window.Paddle?.Environment.set('sandbox');
        if (token) window.Paddle?.Initialize({ token });
      } catch { /* fall through to contact link */ }
      setReady(true);
    };
    document.head.appendChild(s);
  }, []);
  return ready;
}

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 24, marginBottom: 20,
};

const PlanCard: React.FC<{ tier: Tier }> = ({ tier }) => {
  const user = useAuthStore((s) => s.user);
  const paddleReady = usePaddleReady();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/billing/status', { headers: { ...authHeader() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setBilling(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!billing) return null;

  const cfg = PRICES[tier];
  const currentTier = billing.license_tier || 'free';
  const onPaidPlan = PAID_TIERS[tier].includes(currentTier);
  const inGrace = !!billing.grace_period;
  const priceId = period === 'yearly' ? cfg.yearly : cfg.monthly;

  const planLabel = (() => {
    if (onPaidPlan) return `${cfg.label} (paid)`;
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

  const subscribe = () => {
    if (!priceId || !paddleReady || !window.Paddle) {
      window.location.href = CONTACT_MAILTO;
      return;
    }
    setOpening(true);
    try {
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customData: user?.org_id ? { org_id: String(user.org_id) } : undefined,
        customer: user?.email ? { email: user.email } : undefined,
      });
    } catch {
      window.location.href = CONTACT_MAILTO;
    } finally {
      setOpening(false);
    }
  };

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 12px',
    borderRadius: 10,
    fontSize: '0.85rem',
    fontWeight: 600,
    lineHeight: 1.35,
    cursor: 'pointer',
    textAlign: 'center',
    whiteSpace: 'normal',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text)',
  });

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700 }}>Plan</h2>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', fontSize: '0.9rem', borderBottom: onPaidPlan ? 'none' : '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Current plan</span>
        <span style={{ fontWeight: 600, textAlign: 'right' }}>{planLabel}</span>
      </div>

      {onPaidPlan ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 12, marginBottom: 0, lineHeight: 1.55 }}>
          Your subscription is active. Manage payment or cancel any time via the link in your Paddle
          receipt emails, or see our{' '}
          <a href="/refunds" style={{ color: 'var(--primary)' }}>refund &amp; cancellation policy</a>.
        </p>
      ) : (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 0, marginBottom: 14, lineHeight: 1.55 }}>
            {inGrace
              ? 'Your free trial has ended. Subscribe to restore full access.'
              : 'Your 30-day free trial gives full access — no card needed. Subscribe whenever you’re ready.'}
          </p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button style={toggleBtn(period === 'yearly')} onClick={() => setPeriod('yearly')}>
              Yearly · $99.99<br />
              <span style={{ fontWeight: 500, opacity: 0.85, fontSize: '0.78rem' }}>save 30%</span>
            </button>
            <button style={toggleBtn(period === 'monthly')} onClick={() => setPeriod('monthly')}>
              Monthly · $11.99
            </button>
          </div>

          <button
            onClick={subscribe}
            disabled={opening}
            style={{
              width: '100%',
              padding: '11px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--primary)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: opening ? 'wait' : 'pointer',
              opacity: opening ? 0.7 : 1,
            }}
          >
            {opening ? 'Opening checkout…' : `Subscribe — ${period === 'yearly' ? '$99.99/year' : '$11.99/month'}`}
          </button>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 10, marginBottom: 0, textAlign: 'center' }}>
            Billing is handled by Paddle, our Merchant of Record. See our{' '}
            <a href="/refunds" style={{ color: 'var(--primary)' }}>refund policy</a>.
          </p>
        </div>
      )}
    </div>
  );
};

export default PlanCard;
