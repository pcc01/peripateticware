// Copyright (c) 2026 Paul Christopher Cerda
// Route: /verify-email?token=<signed_token>
// Called when the user clicks the link in their confirmation email.
// Calls the backend to validate the token, activates the account,
// then redirects to login with a success banner.

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type Status = 'verifying' | 'success' | 'expired' | 'error';

const VerifyEmailPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState<Status>('verifying');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }

    fetch(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          setEmail(data.email || '');
          setStatus('success');
          // Auto-redirect after 3 seconds
          setTimeout(() => navigate('/login?verified=1', { replace: true }), 3000);
        } else if (r.status === 410 || data?.detail?.includes('expired')) {
          setStatus('expired');
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [token]);

  if (status === 'verifying') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>⏳</div>
          <h1 style={styles.heading}>{t('pages_auth_verifyemailpage.verifying_your_email', 'Verifying your email…')}</h1>
          <p style={styles.sub}>{t('pages_auth_verifyemailpage.just_a_moment', 'Just a moment.')}</p>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>✅</div>
          <h1 style={styles.heading}>{t('pages_auth_verifyemailpage.email_verified', 'Email verified!')}</h1>
          {email && <p style={styles.sub}><strong>{email}</strong> is now active.</p>}
          <p style={{ ...styles.sub, marginTop: 8 }}>{t('pages_auth_verifyemailpage.redirecting_you_to_login', 'Redirecting you to login…')}</p>
          <button onClick={() => navigate('/login?verified=1', { replace: true })} style={styles.btn}>
            Go to login
          </button>
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>⏰</div>
          <h1 style={styles.heading}>{t('pages_auth_verifyemailpage.link_expired', 'Link expired')}</h1>
          <p style={styles.sub}>{t('pages_auth_verifyemailpage.verification_links_expire_after_24_hours', 'Verification links expire after 24 hours. Request a new one below.')}</p>
          <button onClick={() => navigate('/verify-email-pending', { replace: true })} style={styles.btn}>
            Resend verification email
          </button>
          <button onClick={() => navigate('/login')} style={styles.ghost}>
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>❌</div>
        <h1 style={styles.heading}>{t('pages_auth_verifyemailpage.verification_failed', 'Verification failed')}</h1>
        <p style={styles.sub}>{t('pages_auth_verifyemailpage.this_link_is_invalid_or_has_already_been', 'This link is invalid or has already been used.')}</p>
        <button onClick={() => navigate('/verify-email-pending', { replace: true })} style={styles.btn}>
          Request a new link
        </button>
        <button onClick={() => navigate('/login')} style={styles.ghost}>
          Back to login
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg, #f9f6f1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    fontFamily: 'var(--font-body, "DM Sans", system-ui, sans-serif)',
  },
  card: {
    maxWidth: 440,
    width: '100%',
    background: 'var(--surface, white)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 16,
    padding: '40px 32px',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  },
  heading: {
    fontFamily: 'var(--font-head, "Lora", Georgia, serif)',
    fontSize: '1.6rem',
    fontWeight: 700,
    margin: '0 0 8px',
    color: 'var(--text, #1a1a1a)',
  },
  sub: {
    color: 'var(--text-muted, #6b7280)',
    fontSize: '0.95rem',
    margin: '0 0 24px',
    lineHeight: 1.6,
  },
  btn: {
    display: 'block',
    width: '100%',
    padding: '12px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--primary, #4a7c59)',
    color: 'white',
    fontWeight: 600,
    fontSize: '0.95rem',
    cursor: 'pointer',
    marginBottom: 10,
  },
  ghost: {
    display: 'block',
    width: '100%',
    padding: '10px',
    borderRadius: 10,
    border: '1px solid var(--border, #e5e7eb)',
    background: 'transparent',
    color: 'var(--text-muted, #6b7280)',
    fontWeight: 500,
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--border, #e5e7eb)',
    borderTopColor: 'var(--primary, #4a7c59)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '16px auto 0',
  },
};

export default VerifyEmailPage;
