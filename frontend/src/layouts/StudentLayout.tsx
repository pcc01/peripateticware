// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import DashboardShell, { NavGroup } from './DashboardShell';
import { useTranslation } from 'react-i18next';

interface Props { children: React.ReactNode }

const StudentLayout: React.FC<Props> = ({ children }) => {
  const { t } = useTranslation('common');

  const STUDENT_NAV: NavGroup[] = [
    {
      label: 'Explore & Do',
      items: [
        { icon: '🗺', label: 'Find Activities',  path: '/student', end: true },
        { icon: '▶️', label: t('nav.activities', 'Active Session'),   path: '/student/activities' },
      ],
    },
    {
      label: 'My Work',
      items: [
        { icon: '📓', label: 'Field Notes',    path: '/student/field-notes' },
        { icon: '📔', label: 'Journal',        path: '/student/journal' },
      ],
    },
    {
      label: 'Create',
      items: [
        { icon: '💡', label: 'Self Projects',  path: '/student/self-projects' },
        { icon: '🤝', label: 'Peer Projects',  path: '/student/peer-projects' },
        { icon: '🗺️', label: t('nav.challenges', 'My Challenges'),  path: '/student/proposals' },
      ],
    },
    {
      label: t('nav.progress', 'Progress'),
      items: [
        { icon: '📈', label: 'How It Works',   path: '/student/how-it-works' },
        { icon: '📅', label: t('nav.calendar', 'Calendar'), path: '/student/calendar' },
      ],
    },
    {
      label: 'Account',
      items: [
        { icon: '⚙️', label: t('nav.settings', 'Settings'), path: '/student/settings' },
      ],
    },
  ];

  return (
    <DashboardShell
      navGroups={STUDENT_NAV}
      roleLabel="Student Dashboard"
      roleColor="bg-sky-700"
      accentColor="text-sky-700"
    >
      {children}
    </DashboardShell>
  );
};

export default StudentLayout;
