import { useTranslation } from 'react-i18next';
// src/layouts/TeacherLayout.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';

interface TeacherLayoutProps {
  children: React.ReactNode;
}

export const TeacherLayout: React.FC<TeacherLayoutProps> = ({ children }) => {
  const { t } = useTranslation('landing');
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900">{t("landing:peripateticware", "Peripateticware")}</h1>
          <p className="text-sm text-gray-600 mt-1">{t("landing:teacher_dashboard", "Teacher Dashboard")}</p>
        </div>

        <nav className="mt-8 space-y-2 px-4">
          <button
            onClick={() => navigate('/teacher/activities')}
            className="w-full text-left px-4 py-2 rounded-lg hover:bg-gray-100 transition text-gray-700">{t("landing:teacherlayout.activities", "\uD83D\uDCDA Activities")}


          </button>
          <button
            onClick={() => navigate('/teacher/projects')}
            className="w-full text-left px-4 py-2 rounded-lg hover:bg-gray-100 transition text-gray-700">{t("landing:teacherlayout.projects", "\uD83C\uDFAF Projects")}


          </button>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <div className="text-sm text-gray-600 mb-3">
            <p className="font-semibold">{user?.email}</p>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm">{t("landing:teacherlayout.logout", "Logout")}


          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>);

};

export default TeacherLayout;