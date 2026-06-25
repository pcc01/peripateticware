// Copyright (c) 2026 Paul Christopher Cerda
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useTranslation } from 'react-i18next';

const VerifyEmailPendingPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const email = (location.state as any)?.email || user?.email || '';
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="text-5xl mb-4">📬</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('pages_auth_verifyemailpendingpage.check_your_email', 'Check your email')}</h1>
        <p className="text-gray-600 mb-6">
          We sent a confirmation link
          {email && <> to <strong className="text-gray-800">{email}</strong></>}.
          {' '}Click it to activate your account.
        </p>
        {resent ? (
          <p className="text-green-700 font-medium mb-4">{t('pages_auth_verifyemailpendingpage.new_link_sent', '✅ New link sent!')}</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">{t('pages_auth_verifyemailpendingpage.didnt_get_it_check_spam_or', 'Didn\'t get it? Check spam, or:')}</p>
            <button onClick={handleResend} disabled={loading}
              className="w-full py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white rounded-lg font-medium transition mb-3">
              {loading ? 'Sending…' : 'Resend confirmation email'}
            </button>
          </>
        )}
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <button onClick={() => navigate('/login')} className="text-sm text-gray-500 hover:text-gray-700 underline">
          Back to login
        </button>
      </div>
    </div>
  );
};

export default VerifyEmailPendingPage;
