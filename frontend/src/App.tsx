import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@hooks/useAuth'
import { useUIStore } from '@stores/uiStore'

// Pages - stubs for now, will implement
const LoginPage = () => <div>Login Page (TODO)</div>
const RegisterPage = () => <div>Register Page (TODO)</div>
const TeacherDashboard = () => <div>Teacher Dashboard (TODO)</div>
const StudentDashboard = () => <div>Student Dashboard (TODO)</div>
const SessionPage = () => <div>Session Page (TODO)</div>
const NotFoundPage = () => <div>404 Not Found</div>

// Components - stubs for now
const Header = ({ user }: any) => (
  <header>
    <h1>Peripateticware</h1>
    {user && <p>Welcome, {user.full_name}</p>}
  </header>
)

/**
 * Protected route component
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({
  children,
  roles,
}) => {
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}

/**
 * Main App component
 */
const App: React.FC = () => {
  const { i18n, t } = useTranslation()
  const { isDarkMode } = useUIStore()
  const { isAuthenticated, user } = useAuth()

  // Apply dark mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    }
  }, [isDarkMode])

  // Apply RTL/LTR based on language
  useEffect(() => {
    const dir = i18n.language.startsWith('ar') ? 'rtl' : 'ltr'
    document.documentElement.dir = dir
  }, [i18n.language])

  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        {isAuthenticated && <Header user={user} />}

        <main className="flex-1">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/teacher/*"
              element={
                <ProtectedRoute roles={['teacher', 'admin']}>
                  <TeacherDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/*"
              element={
                <ProtectedRoute roles={['student']}>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/session/:sessionId"
              element={
                <ProtectedRoute>
                  <SessionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                isAuthenticated ? (
                  <Navigate
                    to={user?.role === 'student' ? '/student' : '/teacher'}
                    replace
                  />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App