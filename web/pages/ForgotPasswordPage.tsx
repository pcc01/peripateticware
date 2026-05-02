// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

type ResetStep = 'email' | 'token' | 'password' | 'success';

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<ResetStep>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const calculatePasswordStrength = (pwd: string) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/\d/.test(pwd)) strength++;
    if (/[@$!%*?&]/.test(pwd)) strength++;
    setPasswordStrength(strength);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setMessage({ type: 'error', text: 'Please enter a valid email' });
      return;
    }

    setLoading(true);
    try {
      // In production, call API
      // await resetApi.forgotPassword(email);
      
      setMessage({
        type: 'success',
        text: 'If an account exists with this email, you will receive a reset link'
      });
      
      setTimeout(() => {
        setStep('token');
        setMessage(null);
      }, 2000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to request password reset' });
    } finally {
      setLoading(false);
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      setMessage({ type: 'error', text: 'Please enter the reset token from your email' });
      return;
    }

    setLoading(true);
    try {
      // In production, validate token via API
      // const isValid = await resetApi.validateToken(token);
      
      setMessage({ type: 'success', text: 'Token verified!' });
      
      setTimeout(() => {
        setStep('password');
        setMessage(null);
      }, 1500);
    } catch (error) {
      setMessage({ type: 'error', text: 'Invalid or expired token' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    const errors = [];
    if (password.length < 8) errors.push('At least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('One uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('One lowercase letter');
    if (!/\d/.test(password)) errors.push('One number');
    if (!/[@$!%*?&]/.test(password)) errors.push('One special character (@$!%*?&)');

    if (errors.length > 0) {
      setMessage({
        type: 'error',
        text: `Password must contain: ${errors.join(', ')}`
      });
      return;
    }

    setLoading(true);
    try {
      // In production, call API to reset password
      // await resetApi.resetPassword(token, password);
      
      setMessage({ type: 'success', text: 'Password reset successful!' });
      
      setTimeout(() => {
        setStep('success');
        setMessage(null);
      }, 1500);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reset password. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const getStrengthColor = () => {
    if (passwordStrength <= 1) return 'bg-red-500';
    if (passwordStrength <= 2) return 'bg-yellow-500';
    if (passwordStrength <= 3) return 'bg-blue-500';
    return 'bg-green-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">Reset Password</h1>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Step 1: Email */}
        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="text-center">
              <a href="/login" className="text-blue-600 hover:text-blue-700 text-sm">
                Back to Login
              </a>
            </div>
          </form>
        )}

        {/* Step 2: Token */}
        {step === 'token' && (
          <form onSubmit={handleTokenSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reset Token
              </label>
              <p className="text-sm text-gray-600 mb-4">
                Enter the token from the reset email you received
              </p>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token from email"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Verifying...' : 'Verify Token'}
            </button>

            <button
              type="button"
              onClick={() => setStep('email')}
              className="w-full text-gray-600 py-2 hover:text-gray-700"
            >
              Back
            </button>
          </form>
        )}

        {/* Step 3: New Password */}
        {step === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  calculatePasswordStrength(e.target.value);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              
              {password && (
                <div className="mt-3">
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 flex-1 rounded ${
                          i < passwordStrength ? getStrengthColor() : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    {passwordStrength === 0 && 'Very weak'}
                    {passwordStrength === 1 && 'Weak'}
                    {passwordStrength === 2 && 'Fair'}
                    {passwordStrength === 3 && 'Good'}
                    {passwordStrength === 4 && 'Strong'}
                    {passwordStrength === 5 && 'Very strong'}
                  </p>
                </div>
              )}

              <div className="mt-4 text-xs text-gray-600 space-y-1">
                <p>Must contain:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li className={password.length >= 8 ? 'text-green-600' : ''}>
                    At least 8 characters
                  </li>
                  <li className={/[A-Z]/.test(password) ? 'text-green-600' : ''}>
                    One uppercase letter
                  </li>
                  <li className={/[a-z]/.test(password) ? 'text-green-600' : ''}>
                    One lowercase letter
                  </li>
                  <li className={/\d/.test(password) ? 'text-green-600' : ''}>
                    One number
                  </li>
                  <li className={/[@$!%*?&]/.test(password) ? 'text-green-600' : ''}>
                    One special character
                  </li>
                </ul>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('token');
                setPassword('');
                setConfirmPassword('');
              }}
              className="w-full text-gray-600 py-2 hover:text-gray-700"
            >
              Back
            </button>
          </form>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <div className="text-center space-y-6">
            <div className="text-green-600 text-4xl">✓</div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Password Reset Successful!</h2>
              <p className="text-gray-600">
                Your password has been updated. You can now log in with your new password.
              </p>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
