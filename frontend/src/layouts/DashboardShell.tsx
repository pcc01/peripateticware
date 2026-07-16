// Copyright (c) 2026 Paul Christopher Cerda
// Shared persistent sidebar shell used by all role dashboards.

import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useTranslation } from 'react-i18next';
import { useSessionSecurity } from '@/hooks/useSessionSecurity';
import { PRODUCT_NAME } from '../constants/brand';

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  badge?: number;
  end?: boolean;
}

interface DashboardShellProps {
  children: React.ReactNode;
  navGroups: NavGroup[];
  roleLabel: string;
  roleColor: string;
  accentColor: string;
}

const DashboardShell: React.FC<DashboardShellProps> = ({
  children,
  navGroups,
  roleLabel,
  roleColor,
  accentColor,
}) => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  useSessionSecurity();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)', fontFamily: 'var(--font-body, sans-serif)' }}>
      {/* Skip navigation — WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-blue-700 focus:rounded focus:shadow-lg"
      >{t('layouts_dashboardshell.skip_to_main_content', 'Skip to main content')}</a>
      <aside
        className={`flex flex-col border-r transition-all duration-200 flex-shrink-0 ${collapsed ? 'w-14' : 'w-56'}`}
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* Sidebar header */}
        <div className={`flex items-center justify-between px-3 py-3 ${roleColor}`}>
          {!collapsed && (
            <div className="min-w-0">
              <h1 style={{ fontFamily: 'var(--font-head, serif)', fontSize: '0.95rem', fontWeight: 700, color: 'white', margin: 0, lineHeight: 1.2 }}>
                {PRODUCT_NAME}
              </h1>
              <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{roleLabel}</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-white/80 hover:text-white p-1 rounded transition ml-auto flex-shrink-0"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            style={{ fontSize: '0.75rem' }}
          >
            <span aria-hidden="true">{collapsed ? '>' : '<'}</span>
          </button>
        </div>

        {/* Persona + logout */}
        <div className="px-2 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full ${roleColor} flex items-center justify-center text-white font-bold flex-shrink-0`}
                style={{ fontSize: '0.7rem' }}
              >
                {(user?.full_name || user?.email || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--text)', fontSize: '0.7rem' }}>
                  {user?.full_name || user?.email}
                </p>
                <p className="truncate" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                aria-label={t('layouts_dashboardshell.aria_label_sign_out', 'Sign out')}
                className="p-1.5 rounded hover:text-red-600 hover:bg-red-50 transition flex-shrink-0 border border-transparent hover:border-red-200"
                style={{ color: 'var(--text-muted)' }}
              >
                <LogOut size={15} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full flex justify-center items-center py-1 rounded hover:text-red-600 hover:bg-red-50 transition"
              aria-label={t('layouts_dashboardshell.aria_label_sign_out', 'Sign out')}
              style={{ color: 'var(--text-muted)' }}
            >
              <LogOut size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Nav groups */}
        <nav aria-label={t('layouts_dashboardshell.aria_label_main_navigation', 'Main navigation')} className="flex-1 overflow-y-auto py-2 px-1.5 space-y-3">
          {navGroups.map(group => (
            <div key={group.label}>
              {!collapsed && (
                <p style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 8px', marginBottom: 2 }}>
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map(item => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.end}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md transition"
                      aria-current={undefined}
                      style={({ isActive }: { isActive: boolean }) => ({
                        fontSize: '0.8rem', fontWeight: 500,
                        background: isActive ? 'var(--surface-alt)' : 'transparent',
                        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                      })}
                      aria-label={collapsed ? item.label : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{item.icon}</span>
                      {!collapsed && (
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.label}
                        </span>
                      )}
                      {!collapsed && item.badge != null && item.badge > 0 && (
                        <span
                          className="ml-auto bg-red-500 text-white rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ fontSize: '0.6rem', width: 16, height: 16 }}
                        >
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main id="main-content" className="flex-1 overflow-auto" style={{ background: 'var(--bg, #f9f6f1)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 32px', fontFamily: 'var(--font-body, sans-serif)' }}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardShell;
