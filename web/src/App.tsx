// src/App.tsx

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useParentAuthStore } from './stores/parentAuthStore';
import { useUIStore } from './stores/uiStore';

// Pages - TODO: Create these
// import LoginPage from './pages/LoginPage';
// import RegisterPage from './pages/RegisterPage';
// import DashboardPage from './pages/DashboardPage';
// import ChildProgressPage from './pages/ChildProgressPage';
// import CommunicationPage from './pages/CommunicationPage';
// import ReportsPage from './pages/ReportsPage';
// import SettingsPage from './pages/SettingsPage';
// import NotFoundPage from './pages/NotFoundPage';

// Placeholder components
const LoginPage = () => <div>Login Page</div>;
const DashboardPage = () => <div>Dashboard Page</div>;
const NotFoundPage = () => <div>404 - Page not found</div>;

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const parent = useParentAuthStore((state) => state.parent);
  
  if (!parent) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

function App() {
  const restoreToken = useParentAuthStore((state) => state.restoreToken);
  const isDarkMode = useUIStore((state) => state.isDarkMode);
  const [isReady, setIsReady] = React.useState(false);

  useEffect(() => {
    const initApp = async () => {
      try {
        await restoreToken();
      } catch (error) {
        console.error('Failed to restore token:', error);
      } finally {
        setIsReady(true);
      }
    };

    initApp();
  }, [restoreToken]);

  // Apply dark mode class
  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
        <div className="animate-spin">
          <svg
            className="w-12 h-12 text-[#1f7f7f]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<div>Register Page</div>} />
        <Route path="/forgot-password" element={<div>Forgot Password Page</div>} />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/children/:childId/progress"
          element={
            <ProtectedRoute>
              <div>Child Progress Page</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <div>Messages Page</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <div>Reports Page</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <div>Settings Page</div>
            </ProtectedRoute>
          }
        />

        {/* Redirect root to dashboard or login */}
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
}

export default App;
