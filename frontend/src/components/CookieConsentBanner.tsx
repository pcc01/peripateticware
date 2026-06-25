// Copyright (c) 2026 Paul Christopher Cerda
// Block 14g.2 — Minimal CCPA/GDPR cookie consent banner
// Only functional cookies (auth token) are used — no tracking.
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'ppw_cookie_consent'

const CookieConsentBanner: React.FC = () => {
  const { t } = useTranslation('landing')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      // Small delay so the page renders first
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    setVisible(false)
  }

  if (!visible) return null

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
            'This site uses cookies only for login authentication — no tracking or advertising cookies. '
          )}
          <a href="/cookies" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
            {t('learn_more', 'Learn more')}
          </a>
        </p>
        <button
          onClick={dismiss}

          className="ml-4 px-4 py-2 bg-[var(--primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition flex-shrink-0"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default CookieConsentBanner;
