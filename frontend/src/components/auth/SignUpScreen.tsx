import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Compass, Mail, Lock, User, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import type { UserRole } from '@/types/auth';
import { SyntheticEvent } from 'react';

const signupSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  password_confirm: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['TEACHER', 'STUDENT', 'PARENT', 'ADMIN', 'HOMESCHOOL'] as const, {
    errorMap: () => ({ message: 'Please select a role' })
  }),
  age_confirmed: z.boolean().refine(val => val === true, { message: 'You must confirm your age to continue' }),
}).refine((data) => data.password === data.password_confirm, {
  message: "Passwords don't match",
  path: ["password_confirm"]
});

interface SignupScreenProps {
  onSignup?: (e: SyntheticEvent) => Promise<void>;
  error?: string;
  loading?: boolean;
  formData?: {
    email: string;
    password: string;
    password_confirm: string;
    first_name: string;
    last_name: string;
    role: string;
    age_confirmed: boolean;
  };
  onFormChange?: (field: string, value: string) => void;
}

type SignUpFormData = z.infer<typeof signupSchema>;

const ROLE_OPTIONS = [
  { value: 'TEACHER'    as UserRole, label: '👨‍🏫 Teacher',           desc: 'Create activities and monitor students' },
  { value: 'STUDENT'    as UserRole, label: '👨‍🎓 Student',           desc: 'Complete activities and submit evidence' },
  { value: 'PARENT'     as UserRole, label: '👩‍👩‍👦 Parent',            desc: 'View your child\'s progress' },
  { value: 'HOMESCHOOL' as UserRole, label: '🏡 Homeschool Parent',  desc: 'Teach your children and track state requirements' },
];


export default function SignupScreen({
  onSignup,
  error,
  loading,
  formData,
  onFormChange
}: SignupScreenProps = {}) {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<UserRole>('STUDENT');
  const { signup, isLoading, error: authError } = useAuthStore();
  const { t } = useTranslation('landing');

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      role: 'STUDENT',
    age_confirmed: false
    }
  });

  const role = watch('role');

  const handleRoleSelect = (newRole: UserRole) => {
    setSelectedRole(newRole);
    setValue('role', newRole);
  };

  const onSubmit = async (data: SignUpFormData) => {
    try {
      // ✅ FIXED: Pass correct fields to match new auth.ts interface
      await signup({
        email: data.email,
        password: data.password,
        password_confirm: data.password_confirm,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role as 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN',
        age_group: data.role === 'STUDENT' ? 'under_18' : 'adult'
      });

      setTimeout(() => {
        const authStore = useAuthStore.getState();
        const userRole = authStore.user?.role?.toUpperCase();

        console.log('[SignUpScreen] Navigating based on role:', userRole);

        // Account created — must verify email before accessing dashboard
        navigate('/verify-email-pending', { replace: true, state: { email: data.email } });
      }, 300);
    } catch (err) {
      console.error('[SignUpScreen] Signup error:', err);
      // Error is handled by store
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-green-500 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center mb-8">
            <Link
              to="/login"
              className="text-gray-600 hover:text-gray-900 mr-4">
              
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t("landing:join_us", "Join Us")}</h1>
              <p className="text-gray-600 text-sm">{t("landing:create_your_peripateticware_account", "Create your Peripateticware account")}</p>
            </div>
          </div>

          {(authError || error) &&
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {authError || error}
            </div>
          }

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("landing:first_name", "First Name")}

              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('first_name')}
                  type="text"
                  placeholder={t("landing:john", "John")}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.first_name &&
              <p className="text-red-600 text-xs mt-1">{errors.first_name.message}</p>
              }
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("landing:last_name", "Last Name")}

              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('last_name')}
                  type="text"
                  placeholder={t("landing:doe", "Doe")}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.last_name &&
              <p className="text-red-600 text-xs mt-1">{errors.last_name.message}</p>
              }
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("landing:email_address", "Email Address")}

              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder={t("landing:youexamplecom", "you@example.com")}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.email &&
              <p className="text-red-600 text-xs mt-1">{errors.email.message}</p>
              }
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("landing:password", "Password")}

              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('password')}
                  type="password"
                  placeholder={t("landing:", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.password &&
              <p className="text-red-600 text-xs mt-1">{errors.password.message}</p>
              }
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("landing:confirm_password", "Confirm Password")}

              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('password_confirm')}
                  type="password"
                  placeholder={t("landing:", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.password_confirm &&
              <p className="text-red-600 text-xs mt-1">{errors.password_confirm.message}</p>
              }
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t("landing:i_am_a", "I am a...")}

              </label>
              <div className="flex gap-2">
                {ROLE_OPTIONS.map((option) =>
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleRoleSelect(option.value)}
                  className={`flex-1 py-2 px-3 border-2 rounded-lg text-center font-medium transition text-sm ${
                  role === option.value
                    ? 'border-green-600 bg-green-50 text-green-800'
                    : 'border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50'}`
                  }>
                  {option.label}
                </button>
                )}
              </div>
              {errors.role &&
              <p className="text-red-600 text-xs mt-1">{errors.role.message}</p>
              }
            </div>

            {/* 14b.1 — COPPA age confirmation */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
              <input
                type="checkbox"
                id="age_confirmed"
                {...register('age_confirmed')}
                className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer"
              />
              <label htmlFor="age_confirmed" className="text-sm text-gray-700 cursor-pointer leading-snug">
                {t("landing:age_confirmation", "I confirm that I am 13 years of age or older, or that I have parental consent to create this account.")}
              </label>
            </div>
            {errors.age_confirmed && (
              <p className="text-red-600 text-xs -mt-1">{errors.age_confirmed.message}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              
              {isLoading ?
              <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{t("landing:creating_account", "Creating account...")}

              </> :

              'Create Account'
              }
            </button>
          </form>

          <p className="text-center text-gray-600 text-sm mt-6">{t("landing:already_have_an_account", "Already have an account?")}
            {' '}
            <Link
              to="/login"
              className="text-blue-600 hover:text-blue-700 font-semibold">{t("landing:signupscreen.sign_in", "Sign in")}


            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

