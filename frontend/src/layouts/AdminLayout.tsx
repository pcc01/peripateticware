// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import DashboardShell, { NavGroup } from './DashboardShell';

const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { icon: '📊', label: 'Dashboard', path: '/admin', end: true },
    ],
  },
  {
    label: 'Users & Classes',
    items: [
      { icon: '👥', label: 'User Management',  path: '/admin/users' },
      { icon: '🏫', label: 'Class Management', path: '/admin/classes' },
    ],
  },
  {
    label: 'Content',
    items: [
      { icon: '📐', label: 'Standards Library', path: '/admin/standards' },
      { icon: '📄', label: 'Import Standards',  path: '/admin/curriculum/import' },
    ],
  },
  {
    label: 'Privacy & Compliance',
    items: [
      { icon: '🔒', label: 'Privacy Config', path: '/admin/privacy' },
      { icon: '📋', label: 'Audit Logs',     path: '/admin/logs' },
    ],
  },
  {
    label: 'System',
    items: [
      { icon: '⚙️', label: 'Settings',    path: '/admin/settings' },
      { icon: '📉', label: 'Analytics',   path: '/admin/analytics' },
      { icon: '🖥', label: 'System',      path: '/admin/system' },
    ],
  },
];

interface Props { children: React.ReactNode }

const AdminLayout: React.FC<Props> = ({ children }) => (
  <DashboardShell
    navGroups={ADMIN_NAV}
    roleLabel="Admin Panel"
    roleColor="bg-slate-700"
    accentColor="text-slate-700"
  >
    {children}
  </DashboardShell>
);

export default AdminLayout;
