import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';

// Auth Screens
import { SplashScreen } from './SplashScreen';
import { LoginScreen } from './LoginScreen';
import { SignUpScreen } from './SignUpScreen';
import { Dashboard } from './Dashboard';
import { ProtectedRoute } from './ProtectedRoute';

// Placeholder dashboards (replace with actual implementations)
const TeacherDashboard = () => (
  <div className="min-h-screen bg-white p-8">
    <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
    <p className="text-gray-600 mt-2">Coming soon...</p>
  </div>
);

const StudentDashboard = () => (
  <div className="min-h-screen bg-white p-8">
    <h1 className="text-3xl font-bold">Student Dashboard</h1>
    <p className="text-gray-600 mt-2">Coming soon...</p>
  </div>
);

const ParentDashboard = () => (
  <div className="min-h-screen bg-white p-8">
    <h1 className="text-3xl font-bold">Parent Dashboard</h1>
    <p className="text-gray-600 mt-2">Coming soon...</p>
  </div>
);

const AdminDashboard = () => (
  <div className="min-h-screen bg-white p-8">
    <h1 className="text-3xl font-bold">Admin Dashboard</h1>
    <p className="text-gray-600 mt-2">Coming soon...</p>
  </div>
);

const UnauthorizedPage = () => (
  <div className="min-h-screen bg-white flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">403</h1>
      <p className="text-gray-600 mb-8">You do not have permission to access this page.</p>
      <a href="/" className="text-blue-600 hover:text-blue-700">
        Go back home
      </a>
    </div>
  </div>
);

/**
 * HOW TO INTEGRATE INTO YOUR APP.TSX
 * 
 * Replace the current App routing with this setup:
 * 
 * import { AppRouter } from './components/auth/AppRouter';
 * 
 * function App() {
 *   return <AppRouter />;
 * }
 * 
 * export default App;
 */
export const AppRouter: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <SplashScreen />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <LoginScreen />} />
        <Route path="/signup" element={isAuthenticated ? <Navigate to="/dashboard" /> : <SignUpScreen />} />

        {/* Unauthorized */}
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/teacher"
          element={
            <ProtectedRoute allowedRoles={['teacher', 'admin']}>
              <TeacherDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/student"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/parent"
          element={
            <ProtectedRoute allowedRoles={['parent']}>
              <ParentDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default AppRouter;
