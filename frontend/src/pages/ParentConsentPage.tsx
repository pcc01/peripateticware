// Copyright (c) 2026 Paul Christopher Cerda — Block 14c
// Public page (no auth required): /parent-consent/:token
import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const ParentConsentPage: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation('landing')
  const [status, setStatus] = useState<'idle' | 'consented' | 'declined' | 'error'>('idle')
  const [loading, setLoading] = useState(false)

  const handle = async (consent: boolean) => {
    setLoading(true)
    try {
      if (consent) {
        await fetch('/api/v1/privacy/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id_hash: token,
            consent_type: 'parental',
            consent_version: '1.0',
            jurisdiction: 'COPPA',
          }),
        })
        setStatus('consented')
      } else {
        await fetch(`/api/v1/privacy/consent/${token}`, { method: 'DELETE' })
        setStatus('declined')
      }
    } catch {
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <div className="max-w-lg w-full rounded-2xl border p-8 shadow-lg"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>

        {status === 'idle' && (
          <>
            <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text)' }}>
              {t('parental_consent_title', 'Parental Consent Request')}
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              {t('parental_consent_desc',
                'Your child has created an account on Peripateticware. As a parent or guardian, ' +
                'your consent is required before they can use features that collect location, ' +
                'audio, or photo evidence.'
              )}
            </p>

            <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--surface-alt)' }}>
              <h3 className="font-semibold mb-2 text-sm" style={{ color: 'var(--text)' }}>
                {t('what_we_collect', 'What we collect')}
              </h3>
              <ul className="text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
                <li>• {t('collect_location', 'Location (only during active learning sessions)')}</li>
                <li>• {t('collect_photos', 'Photos and audio recordings (stored securely on our server)')}</li>
                <li>• {t('collect_learning', 'Learning progress and session notes')}</li>
              </ul>
              <p className="text-xs mt-3" style={{ color: 'var(--text-faint)' }}>
                {t('no_ads', 'We never sell data or show ads. You can withdraw consent at any time.')}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handle(true)}
                disabled={loading}
                className="flex-1 py-3 rounded-xl text-white font-semibold disabled:opacity-50"
                style={{ background: 'var(--primary)' }}
              >
                {loading ? t('processing', 'Processing…') : t('i_consent', 'I Consent')}
              </button>
              <button
                onClick={() => handle(false)}
                disabled={loading}
                className="flex-1 py-3 rounded-xl border font-semibold disabled:opacity-50"
                style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
              >
                {t('i_do_not_consent', 'I Do Not Consent')}
              </button>
            </div>
          </>
        )}

        {status === 'consented' && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>
              {t('consent_recorded', 'Consent Recorded')}
            </h2>
            <p style={{ color: 'var(--text-muted)' }}>
              {t('consent_recorded_desc', "Your child's account is now fully activated. Thank you.")}
            </p>
          </div>
        )}

        {status === 'declined' && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">🚫</div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>
              {t('consent_declined', 'Consent Declined')}
            </h2>
            <p style={{ color: 'var(--text-muted)' }}>
              {t('consent_declined_desc', "Your child's account will remain restricted. Contact us if you change your mind.")}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--error)' }}>
              {t('consent_error', 'Something went wrong')}
            </h2>
            <button onClick={() => setStatus('idle')} style={{ color: 'var(--primary)' }}>
              {t('try_again', 'Try again')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ParentConsentPage
