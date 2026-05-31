// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import DashboardShell, { NavGroup } from './DashboardShell';

const PARENT_NAV: NavGroup[] = [
  {
    label: 'My Children',
    items: [
      { icon: '🏠', label: 'Dashboard',    path: '/parent', end: true },
      { icon: '📊', label: 'Progress',     path: '/parent/progress' },
      { icon: '🔗', label: 'Link Child',   path: '/parent/link-child' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { icon: '📥', label: 'Download Reports', path: '/parent/reports' },
      { icon: '📅', label: 'Calendar',          path: '/parent/calendar' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { icon: '💬', label: 'Messages',      path: '/parent/messages' },
      { icon: '🔔', label: 'Notifications', path: '/parent/notifications' },
    ],
  },
  {
    label: 'Account',
    items: [
      { icon: '⚙️', label: 'Settings', path: '/parent/settings' },
    ],
  },
];

interface Props { children: React.ReactNode }

const ParentLayout: React.FC<Props> = ({ children }) => (
  <DashboardShell
    navGroups={PARENT_NAV}
    roleLabel="Parent Dashboard"
    roleColor="bg-amber-700"
    accentColor="text-amber-700"
  >
    {children}
  </DashboardShell>
);

export default ParentLayout;
