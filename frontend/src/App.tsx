import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@hooks/useAuth'
import { useUIStore } from '@stores/uiStore'

// ============================================================================
// Auth Pages
// ============================================================================
import { LoginScreen } from '@components/auth/LoginScreen'
import { SignUpScreen } from '@components/auth/SignUpScreen'
import { SplashScreen } from '@components/auth/SplashScreen'

const LoginPage = LoginScreen
const RegisterPage = SignUpScreen
const NotFoundPage = () => <div>404 Not Found</div>
// ============================================================================
// Student Pages (Stubs)
// ============================================================================
const StudentDashboard = () => <div>Student Dashboard (TODO)</div>
const SessionPage = () => <div>Session Page (TODO)</div>

// ============================================================================
// Teacher Pages - Phase 4 Implementation
// ============================================================================
import ActivityListPage from '@pages/teacher/ActivityListPage'
import ActivityDetailPage from '@pages/teacher/ActivityDetailPage'
import ProjectsPage from '@pages/teacher/ProjectsPage'
import ProjectDetailPage from '@pages/teacher/ProjectDetailPage'

/**
 * Teacher Dashboard with nested routing
 * Routes all teacher-specific paths (/teacher/*)
 */
const TeacherDashboard: React.FC = () => {
  return (
    <Routes>
      {/* Activities Routes */}
      <Route path="activities" element={<ActivityListPage />} />
      <Route path="activities/new" element={<ActivityDetailPage />} />
      <Route path="activities/:id/edit" element={<ActivityDetailPage />} />

      {/* Projects Routes */}
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="projects/new" element={<ProjectDetailPage />} />
      <Route path="projects/:id" element={<ProjectDetailPage />} />

      {/* Default: redirect to activities */}
      <Route path="" element={<Navigate to="activities" replace />} />
      <Route path="*" element={<Navigate to="activities" replace />} />
    </Routes>
  )
}

// ============================================================================
// Header Component
// ============================================================================
const Header = ({ user }: any) => (
  <header className="bg-white dark:bg-slate-900 shadow border-b border-slate-200 dark:border-slate-700">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Peripateticware
        </h1>
        {user && (
          <div className="text-right">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Welcome,{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {user.full_name}
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 capitalize">
              {user.role}
            </p>
          </div>
        )}
      </div>
    </div>
  </header>
)

// ============================================================================
// Protected Route Component
// ============================================================================
/**
 * ProtectedRoute: Ensures user is authenticated and has required role
 *
 * @param children - React component(s) to render if authorized
 * @param roles - Optional array of allowed roles (if omitted, all authenticated users allowed)
 *
 * @example
 * <ProtectedRoute roles={['teacher', 'admin']}>
 *   <TeacherDashboard />
 * </ProtectedRoute>
 */
const ProtectedRoute: React.FC<{
  children: React.ReactNode
  roles?: string[]
}> = ({ children, roles }) => {
  const { isAuthenticated, user } = useAuth()

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Check role if specified
  if (roles && user && !roles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Unauthorized</h1>
          <p className="text-slate-600 mt-2">
            You do not have permission to access this page.
          </p>
          <a href="/" className="text-blue-600 hover:underline mt-4 inline-block">
            Go to home
          </a>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

// ============================================================================
// Main App Component
// ============================================================================
/**
 * App Component
 *
 * Main routing and layout component for Peripateticware
 *
 * Route Structure:
 * /                          - Home (redirects to /login or /teacher or /student)
 * /login                     - Login page
 * /register                  - Registration page
 * /teacher/*                 - Teacher dashboard (protected, requires 'teacher' or 'admin' role)
 *   /teacher/activities      - Activity list page
 *   /teacher/activities/new  - Create new activity
 *   /teacher/activities/:id/edit - Edit activity
 *   /teacher/projects        - Project list page
 *   /teacher/projects/new    - Create new project
 *   /teacher/projects/:id    - View/edit project
 * /student/*                 - Student dashboard (protected, requires 'student' role)
 * /session/:sessionId        - Session page (protected)
 * /404                       - Not found page
 * /*                         - Catch-all (redirects to 404)
 */
const App: React.FC = () => {
  const { i18n } = useTranslation()
  const { isDarkMode } = useUIStore()
  const { isAuthenticated, user } = useAuth()

  // ========================================================================
  // Dark Mode Setup
  // ========================================================================
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  // ========================================================================
  // RTL/LTR Setup
  // ========================================================================
  useEffect(() => {
    // Detect if language is RTL (Arabic, Hebrew, Urdu, etc.)
    const dir = i18n.language.startsWith('ar') || 
                i18n.language.startsWith('he') || 
                i18n.language.startsWith('ur') 
      ? 'rtl' 
      : 'ltr'
    document.documentElement.dir = dir
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        {/* Header - Show if authenticated */}
        {isAuthenticated && <Header user={user} />}

        {/* Main Content */}
        <main className="flex-1">
          <Routes>
            {/* ============================================================
                Auth Routes (Public)
                ============================================================ */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* ============================================================
                Teacher Routes (Protected)
                ============================================================ */}
            <Route
              path="/teacher/*"
              element={
                <ProtectedRoute roles={['teacher', 'admin']}>
                  <TeacherDashboard />
                </ProtectedRoute>
              }
            />

            {/* ============================================================
                Student Routes (Protected)
                ============================================================ */}
            <Route
              path="/student/*"
              element={
                <ProtectedRoute roles={['student']}>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />

            {/* ============================================================
                Session Route (Protected - any authenticated user)
                ============================================================ */}
            <Route
              path="/session/:sessionId"
              element={
                <ProtectedRoute>
                  <SessionPage />
                </ProtectedRoute>
              }
            />

            {/* ============================================================
                Home Route
                ============================================================ */}
           {/* Splash screen on first load */}
           <Route path="/splash" element={<SplashScreen />} />

           {/* Home route */}
           <Route
             path="/"  
             element={
              isAuthenticated ? (
                <Navigate to={user?.role === 'student' ? '/student' : '/teacher'} replace />
              ) : (
                <Navigate to="/splash" replace />
    )
  }
/>
            {/* ============================================================
                Catch-All Routes (Not Found)
                ============================================================ */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
