// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * LinkChildPage — /parent/link-child
 * Separate page for linking a child account to a parent account.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useParentStore } from '@/stores';

export const LinkChildPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { linkChild, linkedChildren, loading, error, clearError } = useParentStore();

  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitError(null);
    try {
      await linkChild(email.trim());
      setSubmitted(true);
      setEmail('');
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to send link request. Please check the email address and try again.');
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 0' }}>
      {/* Back */}
      <button
        onClick={() => navigate('/parent')}
        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', marginBottom: 24, fontWeight: 500 }}
      >
        ← {t('back_to_dashboard', 'Back to Dashboard')}
      </button>

      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 8 }}>
        🔗 {t('link_your_child', 'Link Your Child')}
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.6 }}>
        {t(
          'link_child_description',
          "Enter your child's Peripateticware email address. We'll send them a verification request — once they accept, their progress and activities will appear in your dashboard."
        )}
      </p>

      {/* Success state */}
      {submitted ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '24px',
          textAlign: 'center',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📬</div>
          <h2 style={{ marginBottom: 8 }}>{t('request_sent', 'Request Sent!')}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            {t(
              'link_request_sent_detail',
              "A verification request has been sent to your child's email. Once they accept, they'll appear on your dashboard."
            )}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => setSubmitted(false)}
              style={{
                padding: '10px 24px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer', fontWeight: 500,
              }}
            >
              {t('link_another', 'Link Another Child')}
            </button>
            <button
              onClick={() => navigate('/parent')}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600,
              }}
            >
              {t('back_to_dashboard', 'Back to Dashboard')}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
              {t('childs_email', "Child's Email Address")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('pages_linkchildpage.placeholder_studentexamplecom', 'student@example.com')}
              required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1px solid var(--border)', fontSize: '1rem',
                background: 'var(--surface)', boxSizing: 'border-box',
              }}
            />
          </div>

          {(submitError || error) && (
            <div style={{
              background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, color: '#be123c', fontSize: '0.9rem',
            }}>
              {submitError || error}
              <button
                type="button"
                onClick={() => { setSubmitError(null); clearError(); }}
                style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#be123c', fontWeight: 600 }}
              >
                ✕
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, border: 'none',
              background: 'var(--primary)', color: 'white', fontWeight: 600,
              fontSize: '1rem', cursor: loading ? 'wait' : 'pointer',
              opacity: loading || !email.trim() ? 0.6 : 1,
            }}
          >
            {loading ? t('sending', 'Sending…') : t('send_link_request', 'Send Link Request')}
          </button>
        </form>
      )}

      {/* Currently linked children */}
      {linkedChildren.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h3 style={{ marginBottom: 12, fontWeight: 600 }}>
            {t('linked_children', 'Already Linked')} ({linkedChildren.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {linkedChildren.map((child) => (
              <div key={child.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 8,
              }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{child.full_name}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.85rem' }}>
                    {child.email}
                  </span>
                </div>
                <span style={{
                  padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                  background: child.verified ? '#dcfce7' : '#fef9c3',
                  color: child.verified ? '#166534' : '#854d0e',
                }}>
                  {child.verified ? '✓ Verified' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkChildPage;
