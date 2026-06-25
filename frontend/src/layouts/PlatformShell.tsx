// Copyright (c) 2026 Paul Christopher Cerda
// Shared shell for all /platform/* pages — provides back nav + logout icon.

import React from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { LogOut, ArrowLeft, LayoutDashboard } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useSessionSecurity } from '@/hooks/useSessionSecurity';

const PLATFORM_NAV = [
  { path: '/platform',           label: 'Overview' },
  { path: '/platform/orgs',      label: 'Orgs' },
  { path: '/platform/usage',     label: 'Usage' },
  { path: '/platform/ai-settings', label: 'AI' },
  { path: '/platform/audit-log', label: 'Audit' },
];

export default function PlatformShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuthStore();
  useSessionSecurity();

  const isRoot = location.pathname === '/platform';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg, #f9f6f1)' }}>
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        {/* Back / dashboard */}
        {isRoot ? (
          <Link to="/admin" title="Back to dashboard"
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition">
            <LayoutDashboard className="w-5 h-5" />
          </Link>
        ) : (
          <button onClick={() => navigate(-1)} title="Back"
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* Brand */}
        <span className="text-sm font-semibold text-gray-700 mr-2">Platform Admin</span>

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
          title="Sign out"
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
