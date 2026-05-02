// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// src/pages/RegisterPage.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParentAuthStore } from '../stores/parentAuthStore';
import { authApi, isApiError, getErrorMessage } from '../services/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  const { updateParent } = useParentAuthStore();

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Full name is required';
    }

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      errors.password = 'Password must contain uppercase, lowercase, and numbers';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (!agreeTerms) {
      errors.terms = 'You must agree to the terms and conditions';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await authApi.register(email, password, name);

      if (response.parent && response.token) {
        // Store token
        localStorage.setItem('parentAuthToken', JSON.stringify(response.token));
        localStorage.setItem('parent', JSON.stringify(response.parent));

        // Update auth store
        updateParent(response.parent);

        // Navigate to dashboard
        navigate('/dashboard');
      } else {
        setError('Invalid response from server');
      }
    } catch (err) {
      const errorMessage = isApiError(err) ? err.message : getErrorMessage(err);
      setError(errorMessage);
      console.error('Registration error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center p-4 py-12">
      <div className="card max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">Peripateticware</h1>
          <p className="text-gray-600">Create Parent Account</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              className="input-base"
              disabled={isLoading}
            />
            {validationErrors.name && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.name}</p>
            )}
          </div>

          {/* Email */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="input-base"
              disabled={isLoading}
            />
            {validationErrors.email && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.email}</p>
            )}
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-base"
              disabled={isLoading}
            />
            {validationErrors.password && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.password}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              At least 8 characters with uppercase, lowercase, and numbers
            </p>
          </div>

          {/* Confirm Password */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="input-base"
              disabled={isLoading}
            />
            {validationErrors.confirmPassword && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.confirmPassword}</p>
            )}
          </div>

          {/* Terms & Conditions */}
          <div className="mb-6 flex items-start">
            <input
              type="checkbox"
              id="terms"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-1 mr-2"
              disabled={isLoading}
            />
            <label htmlFor="terms" className="text-xs text-gray-600">
              I agree to the{' '}
              <button
                type="button"
                className="text-primary hover:underline font-semibold"
              >
                Terms & Conditions
              </button>
              {' '}and{' '}
              <button
                type="button"
                className="text-primary hover:underline font-semibold"
              >
                Privacy Policy
              </button>
            </label>
          </div>
          {validationErrors.terms && (
            <p className="text-red-600 text-xs mb-4">{validationErrors.terms}</p>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary mb-4"
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        {/* Login Link */}
        <div className="text-center text-sm">
          <p className="text-gray-600 mb-2">Already have an account?</p>
          <button
            onClick={() => navigate('/login')}
            className="text-primary font-semibold hover:underline"
          >
            Sign in instead
          </button>
        </div>
      </div>
    </div>
  );
}
