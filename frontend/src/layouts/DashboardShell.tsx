// Copyright (c) 2026 Paul Christopher Cerda
// Shared persistent sidebar shell used by all role dashboards.

import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  badge?: number;     // red badge count (e.g. unread submissions)
  end?: boolean;      // exact match for NavLink (for root paths like /teacher)
}

interface DashboardShellProps {
  children: React.ReactNode;
  navGroups: NavGroup[];
  roleLabel: string;
  roleColor: string;   // Tailwind bg class e.g. 'bg-green-800'
  accentColor: string; // Tailwind text/border class e.g. 'text-green-700'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DashboardShell: React.FC<DashboardShellProps> = ({
  children,
  navGroups,
  roleLabel,
  roleColor,
  accentColor,
}) => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-gray-50" style={{ fontFamily: 'var(--font-body, "DM Sans", system-ui, sans-serif)' }}>
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className={`flex flex-col bg-white border-r border-gray-200 shadow-sm transition-all duration-200 flex-shrink-0
                    ${collapsed ? 'w-14' : 'w-56'}`}
      >
        {/* Sidebar header */}
        <div className={`flex items-center justify-between px-3 py-3 ${roleColor}`}>
          {!collapsed && (
            <div className="min-w-0">
              <h1 style={{ fontFamily: 'var(--font-head, "Lora", Georgia, serif)', fontSize: '0.95rem', fontWeight: 700, color: 'white', margin: 0, lineHeight: 1.2 }}>
                Peripateticware
              </h1>
              <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{roleLabel}</p>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-white/80 hover:text-white p-1 rounded transition ml-auto flex-shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ fontSize: '0.75rem' }}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-3">
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
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-2 py-1.5 rounded-md transition
                         ${isActive
                           ? `bg-gray-100 ${accentColor}`
                           : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
                      }
                      style={{ fontSize: '0.8rem', fontWeight: 500 }}
                      title={collapsed ? item.label : undefined}
                    >
                      <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{item.icon}</span>
                      {!collapsed && (
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                      )}
                      {!collapsed && item.badge != null && item.badge > 0 && (
                        <span className="ml-auto bg-red-500 text-white rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ fontSize: '0.6rem', width: 16, height: 16 }}>
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

        {/* User footer */}
        <div className="border-t border-gray-100 p-2">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full ${roleColor} flex items-center justify-center text-white font-bold flex-shrink-0`}
                style={{ fontSize: '0.7rem' }}>
                {(user?.full_name || user?.email || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 font-semibold truncate" style={{ fontSize: '0.7rem' }}>
                  {user?.full_name || user?.email}
                </p>
                <p className="text-gray-400 truncate" style={{ fontSize: '0.65rem' }}>{user?.email}</p>
              </div>
              <button onClick={handleLogout} title="Logout"
                className="text-gray-400 hover:text-red-500 transition flex-shrink-0" style={{ fontSize: '0.8rem' }}>
                ⎋
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} title="Logout"
              className="w-full flex justify-center text-gray-400 hover:text-red-500 transition" style={{ fontSize: '0.8rem' }}>
              ⎋
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content — centred with max-width ──────────────────── */}
      <main className="flex-1 overflow-auto" style={{ background: 'var(--bg, #f9f6f1)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 32px', fontFamily: 'var(--font-body, "DM Sans", system-ui, sans-serif)' }}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardShell;
