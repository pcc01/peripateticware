// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

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
  email: z.string().email('Please enter a valid email or username'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional()
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
  onLogin,
  error,
  loading,
  email,
  password,
  onEmailChange,
  onPasswordChange
}: LoginScreenProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const verifiedBanner = searchParams.get('verified') === '1';
  const errorParam = searchParams.get('error');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error: authError, user } = useAuthStore();
  const { t } = useTranslation('landing');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      // ✅ FIXED: Pass email (not username) to match new auth.ts
      await login({
        email: data.email,
        password: data.password
      });

      setTimeout(() => {
        const authStore = useAuthStore.getState();
        const userRole = (authStore.user?.role || '').toLowerCase().trim();

        console.log('[LoginScreen] Full user object:', authStore.user);
        console.log('[LoginScreen] userRole value:', userRole);
        console.log('[LoginScreen] userRole length:', userRole.length);
        console.log('[LoginScreen] userRole === "student":', userRole === 'student');

        if (userRole === 'teacher') {
          console.log('[LoginScreen] ✅ Navigating to /teacher');
          navigate('/teacher', { replace: true });
        } else if (userRole === 'admin') {
          console.log('[LoginScreen] ✅ Navigating to /admin');
          navigate('/admin', { replace: true });
        } else if (userRole === 'student') {
          console.log('[LoginScreen] ✅ Navigating to /student');
          navigate('/student', { replace: true });
        } else if (userRole === 'parent') {
          console.log('[LoginScreen] ✅ Navigating to /parent');
          navigate('/parent', { replace: true });
        } else if (userRole === 'homeschool') {
          console.log('[LoginScreen] ✅ Navigating to /homeschool');
          navigate('/homeschool', { replace: true });
        } else {
          console.log('[LoginScreen] ❌ No role match! userRole was:', userRole);
          navigate('/', { replace: true });
        }
      }, 300);
    } catch (err) {
      console.error('[LoginScreen] Login error:', err);
    }
  };

  const statusBanner = verifiedBanner
    ? <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">✅ Email confirmed! You can now sign in.</div>
    : errorParam === 'link_expired'
    ? <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">⏰ That link has expired. Please request a new one.</div>
    : errorParam === 'invalid_link'
    ? <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">❌ That link is invalid. Please try again.</div>
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-green-500 flex items-center justify-center px-4">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="bg-blue-100 rounded-full p-3">
                <Compass className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {t('auth.login_title')}
            </h1>
            <p className="text-gray-600">
              {t('auth.login_subtitle')}
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-xs font-semibold text-blue-900 mb-2">Try a demo account</p>
            <div className="flex gap-2">
              {[
                { label: 'Teacher', email: 'teacher@example.com' },
                { label: 'Student', email: 'student@example.com' },
                { label: 'Parent',  email: 'parent@example.com'  },
              ].map(({ label, email }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setValue('email', email);
                    setValue('password', 'SecurePassword123');
                  }}
                  className="flex-1 py-1.5 text-xs font-medium border border-blue-300 bg-white text-blue-700 rounded hover:bg-blue-100 transition"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-blue-600 mt-1.5">Password: <code className="font-mono">SecurePassword123</code></p>
          </div>

          {statusBanner}

          {(authError || error) &&
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {authError || error}
            </div>
          }

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.email_label')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder={t('auth.email_placeholder')}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.email &&
              <p className="text-red-600 text-xs mt-1">{errors.email.message}</p>
              }
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.password_label')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.password_placeholder')}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                  
                  {showPassword ?
                  <EyeOff className="w-5 h-5" /> :

                  <Eye className="w-5 h-5" />
                  }
                </button>
              </div>
              {errors.password &&
              <p className="text-red-600 text-xs mt-1">{errors.password.message}</p>
              }
            </div>

            <div className="flex items-center">
              <input
                {...register('rememberMe')}
                type="checkbox"
                id="rememberMe"
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
              
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700">
                {t('auth.remember_me')}
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              
              {isLoading ?
              <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {t('auth.login_btn')}{t("landing:ing", "ing...")}
              </> :

              t('auth.login_btn')
              }
            </button>
          </form>

          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="px-3 text-gray-500 text-sm">{t("landing:or", "or")}</span>
            <div className="flex-1 border-t border-gray-300"></div>
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
};

