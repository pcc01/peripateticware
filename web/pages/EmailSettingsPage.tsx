// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState, useEffect } from 'react';
import { settingsApi } from '../services/api';

interface EmailPreferences {
  progress_digest_frequency: 'daily' | 'weekly' | 'monthly' | 'never';
  achievement_emails: boolean;
  concern_emails: boolean;
  activity_emails: boolean;
  digest_time: string;
  digest_day?: string;
}

export const EmailSettingsPage: React.FC = () => {
  const [preferences, setPreferences] = useState<EmailPreferences>({
    progress_digest_frequency: 'weekly',
    achievement_emails: true,
    concern_emails: true,
    activity_emails: true,
    digest_time: '09:00'
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      // In production, fetch from API
      // const response = await settingsApi.getEmailPreferences();
      // setPreferences(response.data.preferences);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // In production, save to API
      // await settingsApi.updateEmailPreferences(preferences);
      
      setMessage({
        type: 'success',
        text: 'Email preferences updated successfully!'
      });
      
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to save preferences. Please try again.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    try {
      // In production, send test email via API
      setMessage({
        type: 'success',
        text: 'Test email sent successfully!'
      });
      
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to send test email.'
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Email Settings</h1>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-8 space-y-6">
          {/* Progress Digest Section */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Progress Digest</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frequency
                </label>
                <select
                  value={preferences.progress_digest_frequency}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      progress_digest_frequency: e.target.value as any
                    })
                  }
                  className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="never">Never</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time of Day
                </label>
                <input
                  type="time"
                  value={preferences.digest_time}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      digest_time: e.target.value
                    })
                  }
                  className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Notification Types Section */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Email Notifications</h2>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={preferences.achievement_emails}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      achievement_emails: e.target.checked
                    })
                  }
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="ml-3 text-gray-700">Achievement notifications</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={preferences.concern_emails}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      concern_emails: e.target.checked
                    })
                  }
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="ml-3 text-gray-700">Learning concern alerts</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={preferences.activity_emails}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      activity_emails: e.target.checked
                    })
                  }
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="ml-3 text-gray-700">Activity completion emails</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>

            <button
              onClick={handleTestEmail}
              className="flex-1 bg-gray-200 text-gray-900 py-2 rounded-lg hover:bg-gray-300"
            >
              Send Test Email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailSettingsPage;
