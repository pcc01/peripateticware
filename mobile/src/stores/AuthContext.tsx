// src/stores/AuthContext.tsx
// Provides auth state to the whole app; persists token via AsyncStorage

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, clearToken } from '@/src/api/client';
import { login as apiLogin, logout as apiLogout, LoginResponse } from '@/src/api/auth';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken_] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    getToken().then((t) => {
      if (t) {
        // Token exists but we don't have user info — decode from JWT payload
        try {
          const payload = JSON.parse(atob(t.split('.')[1]));
          // Minimal user from token — email/role fetched fresh on next action
          setToken_(t);
          setUser({ id: payload.sub, email: '', role: 'STUDENT' });
        } catch {
          // Malformed token — clear it
          clearToken();
        }
      }
      setIsLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    const data: LoginResponse = await apiLogin(email, password);
    setToken_(data.access_token);
    setUser({ id: data.user_id, email: data.email, role: data.role.toUpperCase() });
  };

  const logout = async () => {
    await apiLogout();
    setToken_(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
