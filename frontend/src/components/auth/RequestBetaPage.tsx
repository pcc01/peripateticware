// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { PRODUCT_NAME } from '../../constants/brand';

const ROLE_OPTIONS = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'parent', label: 'Parent' },
  { value: 'homeschool', label: 'Homeschool Parent' },
  { value: 'district', label: 'School / District Admin' },
  { value: 'other', label: 'Other' },
];

export const RequestBetaPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('teacher');
  const [organization, setOrganization] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim()) {
      setError('Please enter your name and email.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/beta/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role, organization: organization.trim(), message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.message || 'Something went wrong. Please try again.');
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'linear-gradient(135deg, #4a7c59 0%, #6b9e7e 50%, #d4a574 100%)' }}>
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center mb-8">
            <Link to="/" aria-label="Back to home" className="text-gray-600 hover:text-gray-900 mr-4">
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Compass className="w-5 h-5 text-green-700" aria-hidden="true" />
                Request Beta Access
              </h1>
              <p className="text-gray-600 text-sm">{PRODUCT_NAME} is currently invite-only</p>
            </div>
          </div>

          {submitted ? (
            <div className="text-center py-6">
              <p className="text-lg font-semibold text-gray-900 mb-2">Thanks, {name.split(' ')[0] || 'there'}!</p>
              <p className="text-gray-600 text-sm mb-6">
                We've received your request and sent a confirmation to <strong>{email}</strong>.
                We'll reach out there once a spot opens up. If you already have an invite code,
                you can sign up right away.
              </p>
              <Link to="/login" className="text-green-700 hover:underline font-medium text-sm">
                ← Back to login
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-6">
                We're onboarding new teachers, parents, and schools gradually during beta.
                Tell us a bit about yourself and we'll follow up by email — or if you already
                have an invite code from us, use it on the{' '}
                <Link to="/signup" className="text-green-700 hover:underline font-medium">sign up page</Link>.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="beta-name" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    id="beta-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="beta-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    id="beta-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="beta-role" className="block text-sm font-medium text-gray-700 mb-1">I am a...</label>
                  <select
                    id="beta-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="beta-org" className="block text-sm font-medium text-gray-700 mb-1">School / organization (optional)</label>
                  <input
                    id="beta-org"
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label htmlFor="beta-message" className="block text-sm font-medium text-gray-700 mb-1">Anything else? (optional)</label>
                  <textarea
                    id="beta-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 text-white font-semibold py-2.5 px-4 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Sending…' : 'Request Access'}
                </button>
              </form>
            </>
          )}

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-green-700 hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RequestBetaPage;
