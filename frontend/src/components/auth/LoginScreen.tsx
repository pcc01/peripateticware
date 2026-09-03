// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Compass, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { SyntheticEvent } from 'react';

const loginSchema = z.object({
  // Doubles as "email or username" -- see backend/routes/auth.py's login()
  // for the matching lookup. A strict .email() here (or type="email" on the
  // <input>, changed below) would reject a plain username before the
  // request is even sent, which is what was actually happening.
  email: z.string().min(1, 'Please enter a valid email or username'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

interface LoginScreenProps {
  onLogin?: (e: SyntheticEvent) => Promise<void>;
  error?: string;
  loading?: boolean;
  email?: string;
  password?: string;
  onEmailChange?: (value: string) => void;
  onPasswordChange?: (value: string) => void;
}

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen({
  onLogin, error, loading, email, password, onEmailChange, onPasswordChange,
}: LoginScreenProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const verifiedBanner = searchParams.get('verified') === '1';
  const errorParam = searchParams.get('error');
  const sessionReason = searchParams.get('reason');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const { login, mfaLogin, mfaRequired, cancelMfa, isLoading, error: authError } = useAuthStore();
  const { t } = useTranslation('landing');

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const navigateForRole = () => {
    const authStore = useAuthStore.getState();
    const userRole = (authStore.user?.role || '').toLowerCase().trim();
    if (userRole === 'teacher')     navigate('/teacher',    { replace: true });
    else if (userRole === 'admin')  navigate('/admin',      { replace: true });
    else if (userRole === 'student') navigate('/student',   { replace: true });
    else if (userRole === 'parent') navigate('/parent',     { replace: true });
    else if (userRole === 'homeschool') navigate('/homeschool', { replace: true });
    else navigate('/', { replace: true });
  };

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login({ email: data.email, password: data.password });
      // mfaRequired flips true inside the store when this account has a
      // second factor -- don't navigate yet, the render below switches to
      // the code-entry step instead (reading the store reactively rather
      // than a returned value, since login()'s signature stays Promise<void>).
      if (useAuthStore.getState().mfaRequired) return;
      setTimeout(navigateForRole, 300);
    } catch (err) {
      console.error('[LoginScreen] Login error:', err);
    }
  };

  const onMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await mfaLogin(mfaCode.trim());
      setTimeout(navigateForRole, 300);
    } catch (err) {
      console.error('[LoginScreen] MFA verification error:', err);
    }
  };

  if (mfaRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #4a7c59 0%, #6b9e7e 50%, #d4a574 100%)' }}>
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <div style={{ background: '#e8f0eb' }} className="rounded-full p-3">
                  <Compass className="w-8 h-8" style={{ color: '#4a7c59' }} />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Two-factor authentication</h1>
              <p className="text-gray-600 text-sm">
                Enter the 6-digit code from your authenticator app, or one of your backup codes.
              </p>
            </div>

            {authError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
                {authError}
              </div>
            )}

            <form onSubmit={onMfaSubmit} className="space-y-4">
              <input
                type="text"
                autoFocus
                autoComplete="one-time-code"
                placeholder="123456"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center tracking-widest text-lg"
              />
              <button type="submit" disabled={isLoading || !mfaCode.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
                {isLoading ? 'Verifying…' : 'Verify'}
              </button>
              <button type="button" onClick={cancelMfa}
                className="w-full text-gray-500 hover:text-gray-700 text-sm py-1">
                ← Back to login
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const statusBanner = sessionReason === 'idle'
    ? <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">{t('components_auth_loginscreen.you_were_signed_out_due_to_inactivity_pl', 'You were signed out due to inactivity. Please sign in again.')}</div>
    : sessionReason === 'expired'
    ? <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">{t('components_auth_loginscreen.your_session_expired_please_sign_in_agai', 'Your session expired. Please sign in again.')}</div>
    : verifiedBanner
    ? <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">{t('components_auth_loginscreen.email_confirmed_you_can_now_sign_in', 'Email confirmed! You can now sign in.')}</div>
    : errorParam === 'link_expired'
    ? <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">{t('components_auth_loginscreen.that_link_has_expired_please_request_a_n', 'That link has expired. Please request a new one.')}</div>
    : errorParam === 'invalid_link'
    ? <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{t('components_auth_loginscreen.that_link_is_invalid_please_try_again', 'That link is invalid. Please try again.')}</div>
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #4a7c59 0%, #6b9e7e 50%, #d4a574 100%)' }}>
      <div className="absolute inset-0" style={{ opacity: 0.12, pointerEvents: 'none' }}>
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full blur-3xl" style={{ background: '#faf7f2' }} />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full blur-3xl" style={{ background: '#faf7f2' }} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div style={{ background: '#e8f0eb' }} className="rounded-full p-3">
                <Compass className="w-8 h-8" style={{ color: '#4a7c59' }} />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('auth.login_title')}</h1>
            <p className="text-gray-600">{t('auth.login_subtitle')}</p>
          </div>

          {/* Demo accounts — dev/staging only. Never render on production:
              it advertised a working one-click login (incl. Admin) plus the
              shared password in plaintext. Opt a demo/staging deploy back in
              with VITE_SHOW_DEMO_LOGINS=true at build time. */}
          {(import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGINS === 'true') && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.75rem', padding: '12px', marginBottom: '16px' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534', marginBottom: '8px', letterSpacing: '0.05em' }}>{t('components_auth_loginscreen.try_a_demo_account', 'TRY A DEMO ACCOUNT')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {[
                { label: 'Teacher',    email: 'teacher@example.com',    color: '#4a7c59' },
                { label: 'Student',    email: 'student@example.com',    color: '#0369a1' },
                { label: 'Parent',     email: 'parent@example.com',     color: '#b45309' },
                { label: 'Homeschool', email: 'homeschool@example.com', color: '#15803d' },
                { label: 'Admin',      email: 'admin@example.com',      color: '#64748b' },
              ].map(({ label, email: demoEmail, color }) => (
                <button key={label} type="button"
                  aria-label={`Fill demo credentials for ${label}`}
                  onClick={() => { setValue('email', demoEmail); setValue('password', 'SecurePass123!'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 8px',
                    border: `1px solid ${color}44`, borderRadius: '8px', background: '#fff',
                    cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color: '#1e293b' }}>
                  <span style={{ color }}>{label}</span>
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '8px', textAlign: 'center' }}>{t('components_auth_loginscreen.password_securepass123', 'Password: SecurePass123!')}</p>
          </div>
          )}

          {statusBanner}

          {(authError || error) && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {authError || error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="login-email-field" className="block text-sm font-medium text-gray-700 mb-2">{t('auth.email_label', 'Email or Username')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                {/* type="text", not "email" -- type="email" triggers the browser's
                    own native validation (independent of Zod above), which
                    silently blocks submitting a plain username too. */}
                <input {...register('email')} type="text" autoComplete="username" placeholder={t('auth.email_placeholder', 'you@example.com or username')}
                  id="login-email-field"
                  aria-describedby={errors.email ? "login-email-error" : undefined}
                  aria-invalid={!!errors.email}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              {errors.email && <p id="login-email-error" role="alert" className="text-red-600 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="login-password-field" className="block text-sm font-medium text-gray-700 mb-2">{t('auth.password_label')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input {...register('password')} type={showPassword ? 'text' : 'password'}
                  id="login-password-field"
                  placeholder={t('auth.password_placeholder')}
                  aria-describedby={errors.password ? "login-password-error" : undefined}
                  aria-invalid={!!errors.password}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </button>
              </div>
              {errors.password && <p id="login-password-error" role="alert" className="text-red-600 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div className="flex items-center">
              <input {...register('rememberMe')} type="checkbox" id="rememberMe"
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700">{t('auth.remember_me')}</label>
            </div>

            <button type="submit" disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </>
              ) : t('auth.login_btn')}
            </button>
          </form>

          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-gray-300" />
            <span className="px-3 text-gray-500 text-sm">{t('components_auth_loginscreen.or', 'or')}</span>
            <div className="flex-1 border-t border-gray-300" />
          </div>

          <div className="text-center text-sm space-y-2">
            <div>
              <Link to="/forgot-password" className="text-gray-500 hover:text-green-700 underline">
                Forgot your password?
              </Link>
            </div>
            <p className="text-gray-600">
              {t('auth.no_account')}{' '}
              <Link to="/signup" className="text-blue-600 hover:text-blue-700 font-semibold">
                {t('auth.signup_link')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
