// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, loading, error, clearError } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')

  // Test credentials (from your API initialization)
  const testUsers = [
    { email: 'teacher@example.com', password: 'SecurePassword123', role: 'teacher' },
    { email: 'student@example.com', password: 'SecurePassword123', role: 'student' },
    { email: 'parent@example.com', password: 'SecurePassword123', role: 'parent' }
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')

    if (!email.trim()) {
      setLocalError('Email is required')
      return
    }

    if (!password) {
      setLocalError('Password is required')
      return
    }

    try {
      await login(email, password)
      navigate('/teacher')
    } catch (err: any) {
      setLocalError(err.message || 'Login failed. Please try again.')
    }
  }

  const handleTestLogin = async (testEmail: string, testPassword: string) => {
    setEmail(testEmail)
    setPassword(testPassword)
    setLocalError('')

    try {
      await login(testEmail, testPassword)
      navigate('/teacher')
    } catch (err: any) {
      setLocalError(err.message || 'Login failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌍</div>
          <h1 className="text-3xl font-bold text-gray-900">Peripateticware</h1>
          <p className="text-gray-600 mt-2">AI-Powered Contextual Learning</p>
        </div>

        {/* Error Messages */}
        {(error || localError) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">
              <strong>Error:</strong> {error || localError}
            </p>
            {(error || localError) && (
              <button
                onClick={() => {
                  clearError()
                  setLocalError('')
                }}
                className="text-red-600 text-xs mt-2 underline hover:text-red-700"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          {/* Email Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="teacher@example.com"
              disabled={loading}
            />
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or use test account</span>
          </div>
        </div>

        {/* Test Credentials */}
        <div className="space-y-2">
          <p className="text-xs text-gray-600 font-semibold mb-3">DEVELOPMENT TEST CREDENTIALS:</p>
          
          {testUsers.map((user) => (
            <button
              key={user.email}
              onClick={() => handleTestLogin(user.email, user.password)}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-semibold disabled:opacity-50"
            >
              <span className="capitalize">{user.role}</span>
              <br />
              <span className="text-xs text-gray-500">{user.email}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-500">
          <p>Phase 4, Week 1 - Development Build</p>
          <p className="mt-1">FastAPI: http://localhost:8000</p>
          <p>PostgreSQL: Connected</p>
        </div>
      </div>

      {/* Copyright */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-400">
        © 2026 Paul Christopher Cerda - BSL 1.1
      </div>
    </div>
  )
}

export default LoginPage
