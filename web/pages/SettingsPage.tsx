// src/pages/SettingsPage.tsx

import React, { useState } from 'react';
import { settingsApi, isApiError, getErrorMessage } from "../services/api";
import { useUIStore } from '../stores/progressStore';

interface ParentSettings {
  darkMode: boolean;
  language: 'en' | 'es' | 'ar' | 'ja';
  emailFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  notificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
}

export default function SettingsPage() {
  const parent = useParentAuthStore((state) => state.parent);
  const updateParent = useParentAuthStore((state) => state.updateParent);
  const isDarkMode = useUIStore((state) => state.isDarkMode);
  const toggleDarkMode = useUIStore((state) => state.toggleDarkMode);
  const language = useUIStore((state) => state.language);
  const setLanguage = useUIStore((state) => state.setLanguage);

  const [settings, setSettings] = useState<ParentSettings>({
    darkMode: isDarkMode,
    language: language as 'en' | 'es' | 'ar' | 'ja',
    emailFrequency: 'weekly',
    notificationsEnabled: true,
    pushNotificationsEnabled: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleDarkModeToggle = () => {
    toggleDarkMode();
    setSettings({ ...settings, darkMode: !settings.darkMode });
  };

  const handleLanguageChange = (lang: 'en' | 'es' | 'ar' | 'ja') => {
    setLanguage(lang);
    setSettings({ ...settings, language: lang });
  };

  const handleSaveSettings = async () => {
    if (!parent?.id) return;
    try {
      setIsSaving(true);
      await settingsApi.updateSettings(parent.id, settings);
      setSaveMessage("Settings saved successfully!");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      const message = isApiError(err) ? err.message : getErrorMessage(err);
      setSaveMessage(`Failed to save: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
          Settings
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Manage your account preferences and notifications
        </p>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className={`p-4 rounded-lg mb-6 ${
          saveMessage.includes('success')
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {saveMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account Section */}
          <div className="card">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
              Account
            </h2>
            
            <div className="space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={parent?.name || ''}
                  disabled
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg dark:bg-neutral-700 disabled:bg-neutral-100 dark:disabled:bg-neutral-800"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Contact support to change your name
                </p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={parent?.email || ''}
                  disabled
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg dark:bg-neutral-700 disabled:bg-neutral-100 dark:disabled:bg-neutral-800"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Contact support to change your email
                </p>
              </div>

              {/* Password */}
              <button className="text-sm text-primary hover:underline font-semibold">
                Change Password
              </button>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="card">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
              Preferences
            </h2>

            <div className="space-y-6">
              {/* Theme */}
              <div className="flex justify-between items-center pb-4 border-b border-neutral-200 dark:border-neutral-700">
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                    Dark Mode
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Use dark theme for the app
                  </p>
                </div>
                <button
                  onClick={handleDarkModeToggle}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.darkMode ? 'bg-primary' : 'bg-neutral-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.darkMode ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Language */}
              <div>
                <label className="block font-semibold text-neutral-900 dark:text-neutral-50 mb-3">
                  Language
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { code: 'en', name: 'English', flag: '🇺🇸' },
                    { code: 'es', name: 'Español', flag: '🇪🇸' },
                    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
                    { code: 'ja', name: '日本語', flag: '🇯🇵' },
                  ].map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.code as any)}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        settings.language === lang.code
                          ? 'border-primary bg-primary/10'
                          : 'border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      <p className="text-2xl mb-1">{lang.flag}</p>
                      <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        {lang.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Notifications Section */}
          <div className="card">
            <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
              Notifications
            </h2>

            <div className="space-y-4">
              {/* Email Frequency */}
              <div>
                <label className="block font-semibold text-neutral-900 dark:text-neutral-50 mb-3">
                  Email Digest Frequency
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'biweekly', label: 'Bi-weekly' },
                    { value: 'monthly', label: 'Monthly' },
                  ].map((freq) => (
                    <button
                      key={freq.value}
                      onClick={() => setSettings({ ...settings, emailFrequency: freq.value as any })}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        settings.emailFrequency === freq.value
                          ? 'border-primary bg-primary/10'
                          : 'border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                        {freq.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle Notifications */}
              <div className="flex justify-between items-center pt-4 border-t border-neutral-200 dark:border-neutral-700">
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                    Email Notifications
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Receive email updates about your children
                  </p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, notificationsEnabled: !settings.notificationsEnabled })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.notificationsEnabled ? 'bg-primary' : 'bg-neutral-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.notificationsEnabled ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-neutral-200 dark:border-neutral-700">
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                    Push Notifications
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Receive browser push notifications
                  </p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, pushNotificationsEnabled: !settings.pushNotificationsEnabled })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.pushNotificationsEnabled ? 'bg-primary' : 'bg-neutral-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.pushNotificationsEnabled ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="w-full btn btn-primary"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Sidebar Info */}
        <div className="lg:col-span-1">
          <div className="card sticky top-6">
            <h3 className="font-bold text-neutral-900 dark:text-neutral-50 mb-4">
              About
            </h3>
            <div className="space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
              <p>
                <span className="font-semibold">Version:</span> 0.1.0
              </p>
              <p>
                <span className="font-semibold">Member Since:</span>{' '}
                {parent?.createdAt ? new Date(parent.createdAt).toLocaleDateString() : 'N/A'}
              </p>
              <hr className="my-4 border-neutral-200 dark:border-neutral-700" />
              <button className="text-primary hover:underline font-semibold text-sm">
                Privacy Policy
              </button>
              <br />
              <button className="text-primary hover:underline font-semibold text-sm">
                Terms of Service
              </button>
              <br />
              <button className="text-primary hover:underline font-semibold text-sm">
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
