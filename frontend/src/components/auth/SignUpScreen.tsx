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
import type { UserRole } from '../../types/auth';

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['teacher', 'student', 'parent'] as const, {
    errorMap: () => ({ message: 'Please select a role' }),
  }),
  schoolId: z.string().min(1, 'Please select a school'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignUpFormData = z.infer<typeof signupSchema>;

const DEMO_SCHOOLS = [
  { id: 'school-1', name: 'Lincoln Elementary' },
  { id: 'school-2', name: 'Washington Middle School' },
  { id: 'school-3', name: 'Jefferson High School' },
];

const ROLE_OPTIONS = [
  { value: 'teacher' as UserRole, label: '👨‍🏫 Teacher', description: 'Create activities and track student progress' },
  { value: 'student' as UserRole, label: '👨‍🎓 Student', description: 'Capture evidence and track learning' },
  { value: 'parent' as UserRole, label: '👩‍👩‍👦 Parent', description: 'Monitor child\'s progress' },
];

export const SignUpScreen: React.FC = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const { signup, isLoading, error } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      role: 'student',
    },
  });

  const role = watch('role');

  const handleRoleSelect = (newRole: UserRole) => {
    setSelectedRole(newRole);
    setValue('role', newRole);
  };

  const onSubmit = async (data: SignUpFormData) => {
    try {
      await signup({
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        school_id: data.schoolId,
      });

      navigate('/dashboard');
    } catch {
      // Error is handled by useAuthStore
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-green-500 flex items-center justify-center px-4 py-8">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
      </div>

      {/* Sign Up Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="flex items-center mb-8">
            <Link
              to="/login"
              className="text-gray-600 hover:text-gray-900 mr-4"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Join Us</h1>
              <p className="text-gray-600 text-sm">Create your Peripateticware account</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('name')}
                  type="text"
                  placeholder="John Doe"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {errors.name && (
                <p className="text-red-600 text-xs mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {errors.email && (
                <p className="text-red-600 text-xs mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('password')}
                  type="password"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {errors.password && (
                <p className="text-red-600 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  {...register('confirmPassword')}
                  type="password"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-red-600 text-xs mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                I am a...
              </label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleRoleSelect(option.value)}
                    className={`w-full p-3 border-2 rounded-lg text-left transition ${
                      role === option.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900">{option.label}</div>
                    <div className="text-xs text-gray-600">{option.description}</div>
                  </button>
                ))}
              </div>
              {errors.role && (
                <p className="text-red-600 text-xs mt-1">{errors.role.message}</p>
              )}
            </div>

            {/* School Selection */}
            <div>
              <label htmlFor="school" className="block text-sm font-medium text-gray-700 mb-2">
                School
              </label>
              <select
                {...register('schoolId')}
                id="school"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a school...</option>
                {DEMO_SCHOOLS.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
              {errors.schoolId && (
                <p className="text-red-600 text-xs mt-1">{errors.schoolId.message}</p>
              )}
            </div>

            {/* Sign Up Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Sign In Link */}
          <p className="text-center text-gray-600 text-sm mt-6">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-white text-xs opacity-75">
            © 2026 Peripateticware. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUpScreen;
