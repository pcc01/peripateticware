// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import DashboardShell, { NavGroup } from './DashboardShell';

const TEACHER_NAV: NavGroup[] = [
  {
    label: 'Create',
    items: [
      { icon: '➕', label: 'New Activity',    path: '/teacher/activities/new' },
      { icon: '📚', label: 'Activity Library', path: '/teacher/activities' },
      { icon: '📐', label: 'Rubrics',          path: '/teacher/rubrics' },
      { icon: '📋', label: 'Standards',        path: '/teacher/standards' },
    ],
  },
  {
    label: 'Run',
    items: [
      { icon: '🎯', label: 'Active Sessions', path: '/teacher', end: true },
      { icon: '👁', label: 'Tour / Preview',  path: '/teacher/tour' },
    ],
  },
  {
    label: 'Review',
    items: [
      { icon: '📬', label: 'Submissions',        path: '/teacher/submissions' },
      { icon: '📓', label: 'Field Note Review',  path: '/teacher/field-note-review' },
      { icon: '🤝', label: 'Peer Project Review',path: '/teacher/peer-project-review' },
      { icon: '🗺️', label: 'Challenge Proposals', path: '/teacher/proposal-review' },
    ],
  },
  {
    label: 'Students',
    items: [
      { icon: '👥', label: 'Students', path: '/teacher/students' },
      { icon: '🏫', label: 'Projects', path: '/teacher/projects' },
    ],
  },
  {
    label: 'Account',
    items: [
      { icon: '⚙️', label: 'Settings', path: '/teacher/settings' },
    ],
  },
];

interface Props { children: React.ReactNode }

const TeacherLayout: React.FC<Props> = ({ children }) => (
  <DashboardShell
    navGroups={TEACHER_NAV}
    roleLabel="Teacher Dashboard"
    roleColor="bg-green-800"
    accentColor="text-green-700"
  >
    {children}
  </DashboardShell>
);

export default TeacherLayout;
