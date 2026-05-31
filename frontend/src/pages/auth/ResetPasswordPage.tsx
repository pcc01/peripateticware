// Copyright (c) 2026 Paul Christopher Cerda
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!token) { setTokenValid(false); return; }
    fetch(`/api/v1/public/password/reset/${token}`)
      .then(r => r.json())
      .then(data => {
        setTokenValid(data.valid);
        setExpiresIn(data.expires_in_minutes);
      })
      .catch(() => setTokenValid(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (password.length < 8) errs.push('At least 8 characters');
    if (!/[A-Z]/.test(password)) errs.push('At least one uppercase letter');
    if (!/[a-z]/.test(password)) errs.push('At least one lowercase letter');
    if (!/[0-9]/.test(password)) errs.push('At least one number');
    if (!/[@$!%*?&]/.test(password)) errs.push('At least one special character (@$!%*?&)');
    if (password !== confirm) errs.push('Passwords do not match');
    if (errs.length) { setErrors(errs); return; }

    setLoading(true);
    setErrors([]);
    try {
      const res = await fetch('/api/v1/public/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrors([data.detail || 'Reset failed']);
        return;
      }
      setDone(true);
    } catch {
      setErrors(['Something went wrong. Please try again.']);
    } finally {
      setLoading(false);
    }
  };

  if (tokenValid === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-700" />
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-4xl mb-3">⏰</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link expired or invalid</h1>
          <p className="text-gray-500 text-sm mb-5">Reset links are valid for 60 minutes. Please request a new one.</p>
          <button onClick={() => navigate('/forgot-password')}
            className="px-6 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg font-medium transition">
            Request new link
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Password updated</h1>
          <p className="text-gray-500 text-sm mb-5">You can now sign in with your new password.</p>
          <button onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg font-medium transition">
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900">Choose a new password</h1>
          {expiresIn !== null && (
            <p className="text-sm text-amber-600 mt-1">Link expires in {expiresIn} min</p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          {errors.length > 0 && (
            <ul className="text-red-600 text-sm space-y-1 list-disc list-inside">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white rounded-lg font-semibold transition">
            {loading ? 'Saving…' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
