// Copyright (c) 2026 Paul Christopher Cerda
// Shared shell for all /platform/* pages — provides back nav + logout icon.

import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { LogOut, ArrowLeft, LayoutDashboard, KeyRound } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useSessionSecurity } from '@/hooks/useSessionSecurity';
import { getPlatformSecret, setPlatformSecret } from '@/utils/platformFetch';
import { useTranslation } from 'react-i18next';

const PLATFORM_NAV = [
  { path: '/platform',           label: 'Overview' },
  { path: '/platform/orgs',      label: 'Orgs' },
  { path: '/platform/usage',     label: 'Usage' },
  { path: '/platform/ai-settings', label: 'AI' },
  { path: '/platform/audit-log', label: 'Audit' },
];

/**
 * One-time gate: /api/v1/platform/* requires the X-Platform-Secret header
 * (second factor on top of JWT + is_platform_admin) whenever
 * PLATFORM_API_SECRET is configured on the backend. The secret is entered
 * here once per browser session and held in sessionStorage only.
 */
function PlatformSecretGate({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('landing');
  const [value, setValue] = useState('');

  const submit = (secret: string) => {
    setPlatformSecret(secret);
    onDone();
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg, #f9f6f1)' }}>
      <form
        onSubmit={e => { e.preventDefault(); submit(value.trim()); }}
        className="bg-white border border-gray-200 rounded-xl p-6 w-full max-w-sm shadow-sm"
      >
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-5 h-5 text-gray-500" />
          <h1 className="text-sm font-semibold text-gray-800">{t('layouts_platformshell.platform_operator_secret', 'Platform operator secret')}</h1>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Enter the <code>PLATFORM_API_SECRET</code> for this environment. It is kept in this
          tab's session only and sent as <code>X-Platform-Secret</code> with platform-admin requests.
        </p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={t('layouts_platformshell.placeholder_platform_secret', 'Platform secret')}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          type="submit"
          className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium hover:bg-gray-700 transition"
        >{t('layouts_platformshell.continue', 'Continue')}</button>
        <button
          type="button"
          onClick={() => submit('')}
          className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600"
        >
          Continue without a secret (dev — secret not configured)
        </button>
      </form>
    </div>
  );
}

export default function PlatformShell() {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();
  useSessionSecurity();
  const [secretEntered, setSecretEntered] = useState(() => getPlatformSecret() !== null);

  const isRoot = location.pathname === '/platform';

  if (!secretEntered) {
    return <PlatformSecretGate onDone={() => setSecretEntered(true)} />;
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg, #f9f6f1)' }}>
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        {/* Back / dashboard */}
        {isRoot ? (
          <Link to="/admin" title={t('layouts_platformshell.title_back_to_dashboard', 'Back to dashboard')}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition">
            <LayoutDashboard className="w-5 h-5" />
          </Link>
        ) : (
          <button onClick={() => navigate(-1)} title={t('layouts_platformshell.title_back', 'Back')}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* Brand */}
        <span className="text-sm font-semibold text-gray-700 mr-2">{t('layouts_platformshell.platform_admin', 'Platform Admin')}</span>

        {/* Nav tabs */}
        <nav className="flex gap-1 flex-1">
          {PLATFORM_NAV.map(({ path, label }) => {
            const active = path === '/platform'
              ? location.pathname === '/platform'
              : location.pathname.startsWith(path);
            return (
              <Link key={path} to={path}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  active
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Logout icon */}
        <button
          onClick={() => { logout(); navigate('/login'); }}
          title={t('layouts_platformshell.title_sign_out', 'Sign out')}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition border border-transparent hover:border-red-200 ml-auto flex-shrink-0"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Page content */}
      <main>
        <Outlet />
      </main>
    </div>
  );
}
