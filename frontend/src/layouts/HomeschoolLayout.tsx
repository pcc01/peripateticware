// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import DashboardShell, { NavGroup } from './DashboardShell';
import { useTranslation } from 'react-i18next';

interface Props { children: React.ReactNode }

const HomeschoolLayout: React.FC<Props> = ({ children }) => {
  const { t } = useTranslation('common');

  const HOMESCHOOL_NAV: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { icon: '🏠', label: t('nav.dashboard', 'Dashboard'),       path: '/homeschool', end: true },
      ],
    },
    {
      label: 'My Children',
      items: [
        { icon: '👧', label: 'Children',         path: '/homeschool/children' },
        { icon: '📊', label: t('nav.progress', 'Progress'),          path: '/homeschool/progress' },
      ],
    },
    {
      label: t('nav.activities', 'Activities'),
      items: [
        { icon: '➕', label: 'New Activity',      path: '/homeschool/activities/new' },
        { icon: '📚', label: 'Activity Library',  path: '/homeschool/activities' },
        { icon: '📐', label: t('nav.rubrics', 'Rubrics'),           path: '/homeschool/rubrics' },
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
        { icon: '⚙️', label: t('nav.settings', 'Settings'),          path: '/homeschool/settings' },
      ],
    },
  ];

  return (
    <DashboardShell
      navGroups={HOMESCHOOL_NAV}
      roleLabel="Homeschool"
      roleColor="bg-teal-700"
      accentColor="text-teal-700"
    >
      {children}
    </DashboardShell>
  );
};

export default HomeschoolLayout;
