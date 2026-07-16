// Copyright (c) 2026 Paul Christopher Cerda
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ForgotPasswordPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/public/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Request failed');
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-5xl mb-4">📨</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('pages_auth_forgotpasswordpage.check_your_inbox', 'Check your inbox')}</h1>
          <p className="text-gray-600 mb-6">
            If an account exists for <strong>{email}</strong>, you'll receive a password
            reset link shortly. It expires in <strong>60 minutes</strong>.
          </p>
          <button onClick={() => navigate('/login')} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔑</div>
          <h1 className="text-2xl font-bold text-gray-900">{t('pages_auth_forgotpasswordpage.forgot_password', 'Forgot password?')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('pages_auth_forgotpasswordpage.enter_your_email_and_well_send_a_reset_l', 'Enter your email and we\'ll send a reset link.')}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('pages_auth_forgotpasswordpage.email_address', 'Email address')}</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder={t('pages_auth_forgotpasswordpage.placeholder_youexamplecom', 'you@example.com')}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white rounded-lg font-semibold transition">
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <div className="text-center mt-4">
          <button onClick={() => navigate('/login')} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
