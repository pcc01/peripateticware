// Copyright (c) 2026 Paul Christopher Cerda
import React from 'react';
import DashboardShell, { NavGroup } from './DashboardShell';
import { useTranslation } from 'react-i18next';

interface Props { children: React.ReactNode }

const AdminLayout: React.FC<Props> = ({ children }) => {
  const { t } = useTranslation('common');

  const ADMIN_NAV: NavGroup[] = [
    {
      label: 'Overview',
      items: [
        { icon: '📊', label: t('nav.dashboard', 'Dashboard'), path: '/admin', end: true },
      ],
    },
    {
      label: 'Users & Classes',
      items: [
        { icon: '👥', label: t('nav.users', 'User Management'),  path: '/admin/users' },
        { icon: '🏫', label: t('nav.classrooms', 'Class Management'), path: '/admin/classes' },
      ],
    },
    {
      label: 'Content',
      items: [
        { icon: '📐', label: t('nav.standards', 'Standards Library'), path: '/admin/standards' },
        { icon: '📄', label: 'Import Standards',  path: '/admin/curriculum/import' },
        { icon: '📋', label: t('nav.rubrics', 'Rubrics'),           path: '/admin/rubrics' },
        { icon: '📝', label: t('nav.blog', 'Blog'),                 path: '/admin/blog' },
        { icon: '🖼️', label: t('nav.pages', 'Pages'),                path: '/admin/pages' },
      ],
    },
    {
      label: 'AI',
      items: [
        { icon: '🤖', label: t('nav.ai_config', 'AI Routing & Keys'), path: '/admin/ai-config' },
      ],
    },
    {
      label: 'Privacy & Compliance',
      items: [
        { icon: '🔒', label: t('nav.privacy', 'Privacy Config'), path: '/admin/privacy' },
        { icon: '📋', label: t('nav.audit', 'Audit Logs'),     path: '/admin/logs' },
      ],
    },
    {
      label: 'System',
      items: [
        { icon: '⚙️', label: t('nav.settings', 'Settings'),    path: '/admin/settings' },
        { icon: '📉', label: t('nav.analytics', 'Analytics'),   path: '/admin/analytics' },
        { icon: '🖥', label: 'System',      path: '/admin/system' },
      ],
    },
  ];

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      roleLabel="Admin Panel"
      roleColor="bg-slate-700"
      accentColor="text-slate-700"
    >
      {children}
    </DashboardShell>
  );
};

export default AdminLayout;
