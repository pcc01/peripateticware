// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import DashboardShell, { NavGroup } from './DashboardShell';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';

interface Props { children: React.ReactNode }

const TeacherLayout: React.FC<Props> = ({ children }) => {
  const { t } = useTranslation('common');
  const { user } = useAuthStore();
  const isSampleUser = user?.email?.includes('sample') || (user as any)?.is_sample_user === true;

  const TEACHER_NAV: NavGroup[] = [
    {
      label: 'Create',
      items: [
        { icon: '➕', label: t('nav.new_activity', 'New Activity'),  path: '/teacher/activities/new' },
        { icon: '📚', label: t('nav.activities', 'My Activities'),   path: '/teacher/activities' },
        { icon: '🌐', label: t('nav.library', 'Shared Library'),     path: '/teacher/shared-library' },
        { icon: '📐', label: t('nav.rubrics', 'Rubrics'),            path: '/teacher/rubrics' },
        { icon: '📋', label: t('nav.standards', 'Standards'),        path: '/teacher/standards' },
      ],
    },
    {
      label: 'Run',
      items: [
        { icon: '🎯', label: t('nav.dashboard', 'Dashboard'),        path: '/teacher', end: true },
        ...(isSampleUser ? [{ icon: '👁', label: 'Tour / Preview',   path: '/teacher/tour' }] : []),
      ],
    },
    {
      label: 'Review',
      items: [
        { icon: '📬', label: t('nav.submissions', 'Submissions'),          path: '/teacher/submissions' },
        { icon: '📓', label: 'Field Note Review',                          path: '/teacher/field-note-review' },
        { icon: '🤝', label: 'Peer Project Review',                        path: '/teacher/peer-project-review' },
        { icon: '🗺️', label: t('nav.challenges', 'Challenge Proposals'),  path: '/teacher/proposal-review' },
      ],
    },
    {
      label: 'Students',
      items: [
        { icon: '🏫', label: t('nav.classrooms', 'Classrooms'), path: '/teacher/classrooms' },
        { icon: '👥', label: t('nav.students', 'Students'),     path: '/teacher/students' },
        { icon: '🗂️', label: 'Projects',                        path: '/teacher/projects' },
      ],
    },
    {
      label: 'Account',
      items: [
        { icon: '⚙️', label: t('nav.settings', 'Settings'), path: '/teacher/settings' },
      ],
    },
  ];

  return (
    <DashboardShell
      navGroups={TEACHER_NAV}
      roleLabel="Teacher Dashboard"
      roleColor="bg-emerald-700"
      accentColor="text-emerald-700"
    >
      {children}
    </DashboardShell>
  );
};

export default TeacherLayout;
