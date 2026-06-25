// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import { useTranslation } from 'react-i18next';

interface InvitePreview {
  classroom_name: string;
  grade_level:    number | null;
  subject:        string | null;
  org_name:       string;
  email_hint:     string | null;
}

export default function JoinClassroomPage() {
  const { t } = useTranslation('landing');
  const { token }   = useParams<{ token: string }>();
  const navigate    = useNavigate();
  const { setUser } = useAuthStore();

  const [preview, setPreview]   = useState<InvitePreview | null>(null);
  const [previewError, setPreErr] = useState('');
  const [loading, setLoading]   = useState(true);

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '',
    password: '', password_confirm: '',
  });
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [ageError,    setAgeError]    = useState('');
  const [showPw,    setShowPw]  = useState(false);
  const [submitting, setSub]    = useState(false);
  const [formError,  setFormErr] = useState('');

  useEffect(() => {
    if (!token) return;
    axios.get(`/api/v1/classrooms/join/${token}`)
      .then(r => {
        setPreview(r.data);
        if (r.data.email_hint) setForm(f => ({ ...f, email: r.data.email_hint }));
      })
      .catch(e => setPreErr(e?.response?.data?.detail ?? 'Invalid or expired invite link.'))
      .finally(() => setLoading(false));
  }, [token]);

  const validateAge = (): boolean => {
    if (!dateOfBirth) return true; // optional — backend handles it
    const dob = new Date(dateOfBirth);
    const ageMs = Date.now() - dob.getTime();
    const age = Math.floor(ageMs / (1000 * 60 * 60 * 24 * 365.25));
    if (age < 13) {
      setAgeError('Parental consent is required for students under 13. A consent email will be sent to your parent or guardian.');
      return false;
    }
    setAgeError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password_confirm) { setFormErr('Passwords do not match.'); return; }
    const errs: string[] = [];
    if (form.password.length < 8) errs.push('at least 8 characters');
    if (!/[A-Z]/.test(form.password)) errs.push('an uppercase letter');
    if (!/[a-z]/.test(form.password)) errs.push('a lowercase letter');
    if (!/[0-9]/.test(form.password)) errs.push('a number');
    if (!/[@$!%*?&]/.test(form.password)) errs.push('a special character (@$!%*?&)');
    if (errs.length) { setFormErr(`Password must contain: ${errs.join(', ')}.`); return; }
    // Run age validation — if under 13, warn but still allow submit (backend sets account inactive)
    validateAge();
    setFormErr(''); setSub(true);
    try {
      const payload = { ...form, ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}) };
      const { data } = await axios.post(`/api/v1/classrooms/join/${token}`, payload);
      localStorage.setItem('auth_token', data.access_token);
      setUser({ id: data.user_id, email: data.email || '', role: 'STUDENT', name: data.name || '' });
      navigate('/student', { replace: true });
    } catch (err: any) {
      setFormErr(err?.response?.data?.detail ?? 'Something went wrong. Please try again.');
      setSub(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-700" />
    </div>
  );

  if (previewError) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">{t('pages_joinclassroompage.invite_not_found', 'Invite Not Found')}</h1>
        <p className="text-gray-500 text-sm">{previewError}</p>
        <p className="text-gray-400 text-xs mt-4">{t('pages_joinclassroompage.ask_your_teacher_to_resend_the_invite_li', 'Ask your teacher to resend the invite link.')}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7 text-green-700" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('pages_joinclassroompage.you_are_invited', 'You are invited!')}</h1>
          {preview && (
            <div className="mt-3">
              <p className="text-lg font-semibold text-green-800">{preview.classroom_name}</p>
              <p className="text-sm text-gray-500">{preview.org_name}</p>
              {preview.grade_level && (
                <p className="text-xs text-gray-400 mt-1">
                  Grade {preview.grade_level}{preview.subject ? ` - ${preview.subject}` : ''}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
          Password: 8+ chars, uppercase, lowercase, number, and special character (@$!%*?&).
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('pages_joinclassroompage.first_name', 'First name')}</label>
              <input required value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('pages_joinclassroompage.last_name', 'Last name')}</label>
              <input required value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('pages_joinclassroompage.email_address', 'Email address')}</label>
            <input type="email" required value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            {preview?.email_hint && (
              <p className="text-xs text-gray-400 mt-1">Invite sent to {preview.email_hint}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Date of Birth <span className="text-gray-400">(required for COPPA compliance)</span>
            </label>
            <input
              type="date"
              max={new Date().toISOString().split('T')[0]}
              value={dateOfBirth}
              onChange={e => { setDateOfBirth(e.target.value); setAgeError(''); }}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {ageError && <p className="mt-1 text-sm text-amber-600">{ageError}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('pages_joinclassroompage.password', 'Password')}</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} required value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min 8 chars, 1 upper, 1 number, 1 special"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 pr-10" />
              <button type="button" onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('pages_joinclassroompage.confirm_password', 'Confirm password')}</label>
            <input type="password" required value={form.password_confirm}
              onChange={e => setForm(f => ({ ...f, password_confirm: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {formError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg font-semibold text-sm disabled:opacity-50 transition">
            {submitting ? 'Creating your account...' : 'Join classroom'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-green-700 hover:underline">Log in</a>
        </p>
      </div>
    </div>
  );
}
