// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * UpgradeCTA
 *
 * Reusable upgrade prompt that opens Paddle Checkout when clicked.
 * Import and drop anywhere a feature is gated.
 *
 * Usage:
 *   <UpgradeCTA
 *     featureName="Bring Your Own Key"
 *     requiredTier="school_byok"
 *     paddlePriceId="pri_xxx"
 *   />
 *
 * Paddle.js is lazy-loaded on first render and initialised with the
 * VITE_PADDLE_CLIENT_TOKEN env var.  For sandbox testing set
 * VITE_PADDLE_ENVIRONMENT=sandbox.
 *
 * If Paddle.js fails to load (e.g. ad-blocker), the component gracefully
 * falls back to a mailto link.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Zap, ExternalLink, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth';

interface UpgradeCTAProps {
  featureName:   string;
  requiredTier:  string;
  paddlePriceId?: string;
  currentTier?:  string;
  compact?:      boolean;   // show small inline badge instead of full card
}

const TIER_LABELS: Record<string, string> = {
  starter:        'Starter',
  homeschool_family: 'Homeschool',
  homeschool_coop:   'Homeschool Co-op',
  school:         'School',
  school_byok:    'School BYOK',
  district:       'District',
  district_byok:  'District BYOK',
  enterprise:     'Enterprise',
};

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

function usePaddle() {
  const [ready, setReady] = useState(!!window.Paddle);
  const loaded = useRef(false);

  useEffect(() => {
    if (window.Paddle || loaded.current) { setReady(true); return; }
    loaded.current = true;
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = () => {
      const env = import.meta.env.VITE_PADDLE_ENVIRONMENT ?? 'production';
      const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN ?? '';
      if (env === 'sandbox') window.Paddle?.Environment.set('sandbox');
      if (token) window.Paddle?.Initialize({ token });
      setReady(true);
    };
    document.head.appendChild(script);
  }, []);

  return ready;
}

export default function UpgradeCTA({
  featureName,
  requiredTier,
  paddlePriceId,
  currentTier,
  compact = false,
}: UpgradeCTAProps) {
  const { t } = useTranslation('landing');
  const paddleReady = usePaddle();
  const [opening, setOpening] = useState(false);
  // The Paddle webhook resolves which org to upgrade from checkout custom_data
  // (backend/routes/paddle_webhook.py::_handle_subscription_created). Without
  // this, a completed checkout fires subscription.created with no org_id and
  // the upgrade is silently dropped.
  const user = useAuthStore((s) => s.user);

  const tierLabel = TIER_LABELS[requiredTier] ?? requiredTier;

  const handleUpgrade = async () => {
    if (paddlePriceId && paddleReady && window.Paddle) {
      setOpening(true);
      try {
        window.Paddle.Checkout.open({
          items: [{ priceId: paddlePriceId, quantity: 1 }],
          customData: user?.org_id ? { org_id: String(user.org_id) } : undefined,
          customer: user?.email ? { email: user.email } : undefined,
        });
      } catch (e) {
        console.error('[UpgradeCTA] Paddle checkout error:', e);
        // fallback to mailto
        window.location.href = 'mailto:hello@peripateticware.com?subject=Upgrade enquiry';
      } finally {
        setOpening(false);
      }
    } else {
      // No Paddle price ID — open contact email
      window.location.href = 'mailto:hello@peripateticware.com?subject=Upgrade enquiry';
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleUpgrade}
        className="inline-flex items-center gap-1.5 text-xs bg-amber-100 text-amber-800 hover:bg-amber-200 px-2.5 py-1 rounded-full font-medium transition"
      >
        <Zap className="w-3 h-3" />
        Upgrade to {tierLabel}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-5 text-center space-y-3">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mx-auto">
        <Zap className="w-6 h-6 text-amber-600" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          {featureName} requires {tierLabel}
        </h3>
        {currentTier && (
          <p className="text-sm text-gray-500 mt-0.5">
            You're on <strong>{TIER_LABELS[currentTier] ?? currentTier}</strong>
          </p>
        )}
        <p className="text-sm text-gray-500 mt-1">{t('components_upgradecta.upgrade_to_unlock_this_feature_and_more', 'Upgrade to unlock this feature and more.')}</p>
      </div>
      <button
        onClick={handleUpgrade}
        disabled={opening}
        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition disabled:opacity-60"
      >
        {opening ? (
          <><Loader className="w-4 h-4 animate-spin" />Opening…</>
        ) : (
          <><Zap className="w-4 h-4" />Upgrade now</>
        )}
      </button>
      <p className="text-xs text-gray-400">
        Questions?{' '}
        <a href="mailto:hello@peripateticware.com?subject=Upgrade%20enquiry"
          className="text-amber-600 hover:underline font-medium"
        >{t('components_upgradecta.contact_us', 'Contact us')}</a>
      </p>
    </div>
  );
}
