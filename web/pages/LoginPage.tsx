// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// src/pages/LoginPage.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParentAuthStore } from '../stores/parentAuthStore';
import { authApi, isApiError, getErrorMessage } from '../services/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { updateParent } = useParentAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setIsLoading(true);
      const response = await authApi.login(email, password);

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
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center p-4">
      <div className="card max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">Peripateticware</h1>
          <p className="text-gray-600">Parent Portal</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="your@email.com"
              className="input-base"
              disabled={isLoading}
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              className="input-base"
              disabled={isLoading}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full btn-primary mb-4"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center text-sm space-y-3">
          <p className="text-gray-600">Don't have an account?</p>
          <button
            onClick={() => navigate('/register')}
            className="text-primary font-semibold hover:underline"
          >
            Create one now
          </button>

          <div className="pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-sm text-gray-600 hover:text-primary"
            >
              Forgot your password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
