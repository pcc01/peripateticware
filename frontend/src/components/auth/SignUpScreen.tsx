import { useTranslation } from 'react-i18next';
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Compass, Mail, Lock, User, ArrowLeft, MapPin } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useGeoHint } from '../../hooks/useGeoHint';
import type { UserRole } from '@/config/constants';
import { SyntheticEvent } from 'react';
import { PRODUCT_NAME } from '../../constants/brand';
import { COUNTRIES, US_STATES, SUBDIVISION_SUPPORT, toSubdivisionCode } from '../../constants/geo';

const signupSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'At least one uppercase letter')
    .regex(/[a-z]/, 'At least one lowercase letter')
    .regex(/[0-9]/, 'At least one number')
    .regex(/[@$!%*?&]/, 'At least one special character (@$!%*?&)'),
  password_confirm: z.string().min(8, 'At least 8 characters'),
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

// NOTE: STUDENT is intentionally removed — students join via teacher invite link only.
// Directing students to /join/:token keeps classrooms organised and prevents orphan accounts.
const ROLE_OPTIONS = [
  { value: 'TEACHER'    as UserRole, label: '👨‍🏫 Teacher',           desc: 'Create activities, invite students, and monitor progress' },
  { value: 'PARENT'     as UserRole, label: '👩‍👩‍👦 Parent',            desc: 'View your child\'s progress and communicate with teachers' },
  { value: 'HOMESCHOOL' as UserRole, label: '🏡 Homeschool Parent',  desc: 'Teach your children, track state requirements, and generate portfolio reports' },
];


export default function SignupScreen({
  onSignup,
  error,
  loading,
  formData,
  onFormChange
}: SignupScreenProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || undefined;
  const [selectedRole, setSelectedRole] = useState<UserRole>('TEACHER');
  const [schoolName, setSchoolName] = useState('');
  const { signup, isLoading, error: authError } = useAuthStore();
  const { t } = useTranslation('landing');

  // ── Teaching Context state (sprint 2E) ────────────────────────────────────
  const geoHint = useGeoHint();
  const [countryCode, setCountryCode]         = useState<string>('');
  const [subdivisionCode, setSubdivisionCode] = useState<string>('');
  const [hasUnder13, setHasUnder13]           = useState<boolean>(true);
  const [orgTypeV2, setOrgTypeV2]             = useState<string>('');

  // Pre-fill country from geo hint when it loads
  useEffect(() => {
    if (geoHint.countryCode && !countryCode) {
      setCountryCode(geoHint.countryCode);
    }
  }, [geoHint.countryCode]);

  const showTeachingContext = selectedRole === 'TEACHER' || selectedRole === 'HOMESCHOOL';

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      role: 'TEACHER',
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
      await signup({
        email: data.email,
        password: data.password,
        password_confirm: data.password_confirm,
        first_name: data.first_name,
        last_name: data.last_name,
        role: data.role as import('@/config/constants').UserRole,
        school_name: (selectedRole === 'TEACHER' || selectedRole === 'HOMESCHOOL') && schoolName.trim()
          ? schoolName.trim()
          : undefined,
        // Teaching Context fields
        country_code:     countryCode || undefined,
        subdivision_code: toSubdivisionCode(countryCode, subdivisionCode),
        has_under_13:     showTeachingContext ? hasUnder13 : undefined,
        org_type_v2:      orgTypeV2 || undefined,
        ip_country_hint:  geoHint.countryCode || undefined,
        invite_token:     inviteToken,
      });

      // Navigate based on whether the account is immediately active (EMAIL_DRY_RUN / dev)
      // or needs email verification (production).
      const signedUpUser = useAuthStore.getState().user;
      if (signedUpUser?.is_active) {
        navigate('/login', {
          replace: true,
          state: { successMessage: 'Account created! You can now sign in.' },
        });
      } else {
        navigate('/verify-email-pending', { replace: true, state: { email: data.email } });
      }
    } catch (err) {
      console.error('[SignUpScreen] Signup error:', err);
      // Error displayed via authError from the store
    }
  };

  const onError = (errors: Record<string, unknown>) => {
    console.error('[SignUpScreen] Form validation errors:', errors);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'linear-gradient(135deg, #4a7c59 0%, #6b9e7e 50%, #d4a574 100%)' }}>
      <div className="absolute inset-0" style={{ opacity: 0.12, pointerEvents: 'none' }}>
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full blur-3xl" style={{ background: '#faf7f2' }}></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full blur-3xl" style={{ background: '#faf7f2' }}></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center mb-8">
            <Link
              to="/login"
              aria-label={t('components_auth_signupscreen.aria_label_back_to_login', 'Back to login')}
              className="text-gray-600 hover:text-gray-900 mr-4">
              
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t("landing:join_us", "Join Us")}</h1>
              <p className="text-gray-600 text-sm">{`Create your ${PRODUCT_NAME} account`}</p>
            </div>
          </div>

          {(authError || error) &&
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {authError || error}
            </div>
          }

          {Object.keys(errors).length > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-lg mb-4 text-sm">{t('components_auth_signupscreen.please_fix_the_highlighted_fields_below_', 'Please fix the highlighted fields below before continuing.')}</div>
          )}

          <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-4">
            <div>
              <label htmlFor="signup-first-name" className="block text-sm font-medium text-gray-700 mb-2">{t("landing:first_name", "First Name")}

              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('first_name')}
                  id="signup-first-name"
                  type="text"
                  placeholder={t("landing:john", "John")}
                  aria-describedby={errors.first_name ? "signup-first-name-error" : undefined}
                  aria-invalid={!!errors.first_name}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.first_name &&
              <p id="signup-first-name-error" role="alert" className="text-red-600 text-xs mt-1">{errors.first_name.message}</p>
              }
            </div>

            <div>
              <label htmlFor="signup-last-name" className="block text-sm font-medium text-gray-700 mb-2">{t("landing:last_name", "Last Name")}

              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('last_name')}
                  id="signup-last-name"
                  type="text"
                  placeholder={t("landing:doe", "Doe")}
                  aria-describedby={errors.last_name ? "signup-last-name-error" : undefined}
                  aria-invalid={!!errors.last_name}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.last_name &&
              <p id="signup-last-name-error" role="alert" className="text-red-600 text-xs mt-1">{errors.last_name.message}</p>
              }
            </div>

            <div>
              <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-2">{t("landing:email_address", "Email Address")}

              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('email')}
                  id="signup-email"
                  type="email"
                  placeholder={t("landing:youexamplecom", "you@example.com")}
                  aria-describedby={errors.email ? "signup-email-error" : undefined}
                  aria-invalid={!!errors.email}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.email &&
              <p id="signup-email-error" role="alert" className="text-red-600 text-xs mt-1">{errors.email.message}</p>
              }
            </div>

            <div>
              <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-2">{t("landing:password", "Password")}

              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('password')}
                  id="signup-password"
                  type="password"
                  placeholder={t("landing:", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")}
                  aria-describedby={errors.password ? "signup-password-error" : undefined}
                  aria-invalid={!!errors.password}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.password &&
              <p id="signup-password-error" role="alert" className="text-red-600 text-xs mt-1">{errors.password.message}</p>
              }
            </div>

            <div>
              <label htmlFor="signup-password-confirm" className="block text-sm font-medium text-gray-700 mb-2">{t("landing:confirm_password", "Confirm Password")}

              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('password_confirm')}
                  id="signup-password-confirm"
                  type="password"
                  placeholder={t("landing:", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")}
                  aria-describedby={errors.password_confirm ? "signup-password-confirm-error" : undefined}
                  aria-invalid={!!errors.password_confirm}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                
              </div>
              {errors.password_confirm &&
              <p id="signup-password-confirm-error" role="alert" className="text-red-600 text-xs mt-1">{errors.password_confirm.message}</p>
              }
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">{t("landing:i_am_a", "I am a...")}

              </label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map((option) =>
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={role === option.value}
                  onClick={() => handleRoleSelect(option.value)}
                  className={`py-2 px-3 border-2 rounded-lg text-center font-medium transition text-sm ${
                  role === option.value
                    ? 'border-green-600 bg-green-50 text-green-800'
                    : 'border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50'}`
                  }>
                  {option.label}
                </button>
                )}
              </div>
              {errors.role &&
              <p id="signup-role-error" role="alert" className="text-red-600 text-xs mt-1">{errors.role.message}</p>
              }
            </div>

            {/* School / homeschool name — shown for teacher and homeschool roles */}
            {(selectedRole === 'TEACHER' || selectedRole === 'HOMESCHOOL') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {selectedRole === 'TEACHER' ? 'School name (optional)' : 'Family / co-op name (optional)'}
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={e => setSchoolName(e.target.value)}
                  placeholder={selectedRole === 'TEACHER' ? 'e.g. Springfield Elementary' : 'e.g. Rivera Family'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">{t('components_auth_signupscreen.you_can_change_this_later_in_your_organi', 'You can change this later in your organisation settings.')}</p>
              </div>
            )}

            {/* ── Teaching Context (sprint 2E) — TEACHER / HOMESCHOOL only ─── */}
            {showTeachingContext && (
              <div className="border border-green-200 rounded-xl p-4 bg-green-50 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-green-700" />
                  <span className="text-sm font-semibold text-green-800">{t('components_auth_signupscreen.teaching_context', 'Teaching Context')}</span>
                  {geoHint.isLoading && (
                    <span className="text-xs text-gray-400 ml-1">{t('components_auth_signupscreen.detecting_location', 'Detecting location…')}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 -mt-1">{t('components_auth_signupscreen.helps_us_apply_the_right_privacy_framewo', 'Helps us apply the right privacy frameworks (FERPA, COPPA, GDPR, etc.) for your students.')}</p>

                {/* Country */}
                <div>
                  {/* axe/WCAG: visible <label> text alone doesn't give a <select>
                      an accessible name unless it's programmatically associated
                      via htmlFor/id — axe flagged this as "Select element must
                      have an accessible name" (critical) since there was no
                      such association before. */}
                  <label htmlFor="signup-country" className="block text-xs font-medium text-gray-700 mb-1">{t('components_auth_signupscreen.country', 'Country')}</label>
                  <select
                    id="signup-country"
                    value={countryCode}
                    onChange={e => { setCountryCode(e.target.value); setSubdivisionCode(''); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    <option value="">{t('components_auth_signupscreen.select_country', 'Select country')}</option>
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                    <option value="OTHER">{t('components_auth_signupscreen.other', '🌍 Other')}</option>
                  </select>
                </div>

                {/* State/Province — only for countries where it's meaningful
                    (mirrors backend/routes/geo.py's SUBDIVISION_SUPPORT), so a
                    state-specific privacy law (e.g. a US state's) can actually
                    be matched at signup instead of subdivision_code always
                    being sent as undefined. */}
                {SUBDIVISION_SUPPORT.has(countryCode) && (
                  <div>
                    <label htmlFor="signup-subdivision" className="block text-xs font-medium text-gray-700 mb-1">
                      {t('components_auth_signupscreen.state_province', 'State / Province')}
                    </label>
                    {countryCode === 'US' ? (
                      <select
                        id="signup-subdivision"
                        value={subdivisionCode}
                        onChange={e => setSubdivisionCode(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        <option value="">{t('components_auth_signupscreen.select_state', '— Select state —')}</option>
                        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <input
                        id="signup-subdivision"
                        type="text"
                        value={subdivisionCode}
                        onChange={e => setSubdivisionCode(e.target.value)}
                        placeholder={t('components_auth_signupscreen.province_placeholder', 'e.g. Ontario, São Paulo, Bavaria')}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      />
                    )}
                  </div>
                )}

                {/* Under-13 question */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">{t('components_auth_signupscreen.do_any_of_your_students_have_children_u', 'Do any of your students / children have a birthday after today minus 13 years?')}</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="under13" value="yes" checked={hasUnder13}
                        onChange={() => setHasUnder13(true)}
                        className="accent-green-600" />
                      <span className="text-sm text-gray-700">{t('components_auth_signupscreen.yes_some_are_under_13', 'Yes — some are under 13')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="under13" value="no" checked={!hasUnder13}
                        onChange={() => setHasUnder13(false)}
                        className="accent-green-600" />
                      <span className="text-sm text-gray-700">{t('components_auth_signupscreen.no_all_13', 'No — all 13+')}</span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{t('components_auth_signupscreen.this_determines_whether_coppa_applies_', 'This determines whether COPPA applies to your account.')}</p>
                </div>
              </div>
            )}


            {/* Age confirmation */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="age_confirmed"
                {...register('age_confirmed')}
                className="mt-0.5 accent-green-600 w-4 h-4 shrink-0"
              />
              <label htmlFor="age_confirmed" className="text-sm text-gray-600 leading-tight cursor-pointer">{t('components_auth_signupscreen.i_confirm_that_i_am_18_years_of_age_or_o', 'I confirm that I am 18 years of age or older (or the legal guardian of minor users on this account).')}</label>
            </div>
            {errors.age_confirmed && (
              <p id="signup-age-error" role="alert" className="text-red-600 text-xs -mt-2">{errors.age_confirmed.message}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 text-white font-semibold py-2.5 px-4 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('components_auth_signupscreen.creating_account', 'Creating account...')}
                </>
              ) : (
                t('components_auth_signupscreen.create_account', 'Create account')
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            {t('components_auth_signupscreen.already_have_an_account', 'Already have an account?')}{' '}
            <Link to="/login" className="text-green-700 hover:underline font-medium">
              {t('components_auth_signupscreen.sign_in', 'Sign in')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
