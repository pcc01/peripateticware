// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, User } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Redirect to role-specific dashboard
    const roleRoutes: Record<string, string> = {
      teacher: '/dashboard/teacher',
      student: '/dashboard/student',
      parent: '/dashboard/parent',
      admin: '/dashboard/admin',
    };

    const route = roleRoutes[user.role];
    if (route) {
      navigate(route);
    }
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-gray-600" />
              <span className="text-gray-900">{user.name}</span>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {user.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome, {user.name}!
          </h2>
          <p className="text-gray-600 mb-8">
            Redirecting to your {user.role} dashboard...
          </p>
          <div className="animate-pulse">
            <div className="inline-block">
              <div className="w-12 h-12 bg-blue-600 rounded-full animate-bounce"></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
