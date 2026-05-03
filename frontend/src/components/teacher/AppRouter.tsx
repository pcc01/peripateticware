// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { ReactNode } from 'react'

// Pages/Components
import LoginPage from '@/pages/LoginPage'
import TeacherDashboard from '@/pages/teacher/TeacherDashboard'

// Teacher Components - Activity Management
import ActivityList from '@/components/teacher/ActivityList'
import ActivityManager from '@/components/teacher/ActivityManager'
import ActivityPreview from '@/components/teacher/ActivityPreview'

// Layout
import TeacherLayout from '@/layouts/TeacherLayout'

/**
 * Protected Route Component
 * Checks if user is authenticated and has correct role
 */
interface ProtectedRouteProps {
  role?: string
  children?: ReactNode
}

function ProtectedRoute({ role = 'teacher' }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuthStore()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (role && user.role !== role) {
    return <Navigate to="/login" replace />
  }

  return <TeacherLayout />
}

/**
 * Main App Router
 * Handles all routing for the application
 */
export function AppRouter() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={isAuthenticated ? <Navigate to="/teacher" /> : <Navigate to="/login" />} />

        {/* Teacher Routes - Protected */}
        <Route path="/teacher" element={<ProtectedRoute role="teacher" />}>
          {/* Dashboard */}
          <Route index element={<TeacherDashboard />} />

          {/* Activity Management Routes */}
          <Route path="activities" element={<ActivityList />} />
          <Route path="activities/new" element={<ActivityManager />} />
          <Route path="activities/:id" element={<ActivityPreview />} />
          <Route path="activities/:id/edit" element={<ActivityManager />} />

          {/* Placeholder routes for future features */}
          <Route path="projects" element={<div className="p-6">
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-gray-600 mt-2">Coming soon...</p>
          </div>} />

          <Route path="curriculum" element={<div className="p-6">
            <h1 className="text-3xl font-bold">Curriculum</h1>
            <p className="text-gray-600 mt-2">Coming soon...</p>
          </div>} />

          <Route path="classes" element={<div className="p-6">
            <h1 className="text-3xl font-bold">Classes</h1>
            <p className="text-gray-600 mt-2">Coming soon...</p>
          </div>} />

          <Route path="analytics" element={<div className="p-6">
            <h1 className="text-3xl font-bold">Analytics</h1>
            <p className="text-gray-600 mt-2">Coming soon...</p>
          </div>} />
        </Route>

        {/* 404 Catch-all */}
        <Route path="*" element={<Navigate to={isAuthenticated ? "/teacher" : "/login"} replace />} />
      </Routes>
    </Router>
  )
}

export default AppRouter
