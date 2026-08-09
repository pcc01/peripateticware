// Copyright (c) 2026 Paul Christopher Cerda
// Block 14g.2 — CCPA/GDPR cookie consent banner
// Functional cookies (auth token) are always on. GA4 site analytics is
// strictly opt-in: nothing loads until Accept is clicked here, and consent
// can be withdrawn just as easily via the "Cookie preferences" reopener
// that replaces this banner once a choice is on file. Also hard-blocked on
// student routes/sessions regardless of this choice — see utils/analytics.ts.
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getStoredConsent, recordConsent, type ConsentChoice } from '../utils/analytics'

const CookieConsentBanner: React.FC = () => {
  const { t } = useTranslation('landing')
  const [visible, setVisible] = useState(false)
  const [current, setCurrent] = useState<ConsentChoice | null>(null)

  useEffect(() => {
    const stored = getStoredConsent()
    setCurrent(stored)
    if (!stored) {
      // Small delay so the page renders first
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const respond = (accepted: boolean) => {
    recordConsent(accepted)
    setCurrent(accepted ? 'accepted' : 'declined')
    setVisible(false)
  }

  if (!visible) {
    if (!current) return null
    // Reopen affordance — always reachable, on every page, so withdrawing
    // consent later is exactly as easy as giving it was.
    return (
      <button
        onClick={() => setVisible(true)}
        aria-label={t('cookie_preferences', 'Cookie preferences')}
        style={{
          position: 'fixed',
          bottom: 12,
          left: 12,
          zIndex: 49,
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 10px',
          cursor: 'pointer',
          opacity: 0.85,
        }}
      >🍪 {t('cookie_preferences', 'Cookie preferences')}</button>
    )
  }

  return (
    <div
      role="dialog"
      aria-label={t('cookie_consent_title', 'Cookie notice')}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        padding: '12px 16px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          padding: '12px 20px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          pointerEvents: 'auto',
        }}
      >
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flex: 1, margin: 0 }}>
          🍪 {t(
            'cookie_notice',
            'We use essential cookies for login. Site analytics is off by default — enable it below if you\'re OK with it. We never place ads on student accounts. '
          )}
          {current && (
            <strong>
              {current === 'accepted'
                ? t('cookie_status_on', 'Currently: analytics cookies enabled. ')
                : t('cookie_status_off', 'Currently: analytics cookies declined. ')}
            </strong>
          )}
          <a href="/cookies" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
            {t('learn_more', 'Learn more')}
          </a>
        </p>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => respond(false)}
            className="px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition"
            style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >{t('components_cookieconsentbanner.decline', 'Decline')}</button>
          <button
            onClick={() => respond(true)}
            className="px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition"
            style={{ background: 'var(--primary)', color: '#ffffff', border: 'none', cursor: 'pointer' }}
          >{t('components_cookieconsentbanner.accept', 'Accept')}</button>
        </div>
      </div>
    </div>
  );
}

export default CookieConsentBanner;
