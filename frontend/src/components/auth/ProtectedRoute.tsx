import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import type { UserRole } from '../../types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};

export const RoleBasedRoute: React.FC<{
  user: { role: UserRole };
}> = ({ user }) => {
  const roleRoutes: Record<UserRole, string> = {
    teacher: '/dashboard/teacher',
    student: '/dashboard/student',
    parent: '/dashboard/parent',
    admin: '/dashboard/admin',
  };

  return <Navigate to={roleRoutes[user.role]} replace />;
};
