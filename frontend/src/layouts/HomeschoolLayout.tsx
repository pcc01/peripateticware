// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import DashboardShell, { NavGroup } from './DashboardShell';

const HOMESCHOOL_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { icon: '🏠', label: 'Dashboard',       path: '/homeschool', end: true },
    ],
  },
  {
    label: 'My Children',
    items: [
      { icon: '👧', label: 'Children',         path: '/homeschool/children' },
      { icon: '📊', label: 'Progress',          path: '/homeschool/progress' },
    ],
  },
  {
    label: 'Activities',
    items: [
      { icon: '➕', label: 'New Activity',      path: '/homeschool/activities/new' },
      { icon: '📚', label: 'Activity Library',  path: '/homeschool/activities' },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { icon: '📋', label: 'State Requirements', path: '/homeschool/requirements' },
      { icon: '📈', label: 'Coverage Report',    path: '/homeschool/coverage' },
      { icon: '📥', label: 'Export Portfolio',   path: '/homeschool/export' },
    ],
  },
  {
    label: 'Account',
    items: [
      { icon: '⚙️', label: 'Settings',          path: '/homeschool/settings' },
    ],
  },
];

interface Props { children: React.ReactNode }

const HomeschoolLayout: React.FC<Props> = ({ children }) => (
  <DashboardShell
    navGroups={HOMESCHOOL_NAV}
    roleLabel="Homeschool"
    roleColor="bg-teal-700"
    accentColor="text-teal-700"
  >
    {children}
  </DashboardShell>
);

export default HomeschoolLayout;
