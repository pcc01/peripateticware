// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import DashboardShell, { NavGroup } from './DashboardShell';
import { useTranslation } from 'react-i18next';

interface Props { children: React.ReactNode }

const ParentLayout: React.FC<Props> = ({ children }) => {
  const { t } = useTranslation('common');

  const PARENT_NAV: NavGroup[] = [
    {
      label: 'My Children',
      items: [
        { icon: '🏠', label: t('nav.dashboard', 'Dashboard'),    path: '/parent', end: true },
        { icon: '📊', label: t('nav.progress', 'Progress'),     path: '/parent/progress' },
        { icon: '🔗', label: 'Link Child',   path: '/parent/link-child' },
      ],
    },
    {
      label: t('nav.reports', 'Reports'),
      items: [
        { icon: '📥', label: t('nav.reports', 'Download Reports'), path: '/parent/reports' },
        { icon: '📅', label: t('nav.calendar', 'Calendar'),          path: '/parent/calendar' },
      ],
    },
    {
      label: 'Communication',
      items: [
        { icon: '💬', label: t('nav.messages', 'Messages'),      path: '/parent/messages' },
        { icon: '🔔', label: t('nav.notifications', 'Notifications'), path: '/parent/notifications' },
      ],
    },
    {
      label: 'Account',
      items: [
        { icon: '⚙️', label: t('nav.settings', 'Settings'), path: '/parent/settings' },
      ],
    },
  ];

  return (
    <DashboardShell
      navGroups={PARENT_NAV}
      roleLabel="Parent Dashboard"
      roleColor="bg-amber-700"
      accentColor="text-amber-700"
    >
      {children}
    </DashboardShell>
  );
};

export default ParentLayout;
