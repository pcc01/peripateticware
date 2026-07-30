// src/stores/AuthContext.tsx
// Provides auth state to the whole app; persists token via AsyncStorage

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, clearToken } from '@/src/api/client';
import { login as apiLogin, logout as apiLogout, getCurrentUser, LoginResponse } from '@/src/api/auth';

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

  // Restore session on mount. The JWT itself only carries the user id (see
  // src/api/auth.ts's getCurrentUser() comment) — email and role are NOT
  // embedded in it, so decoding the token locally can never recover them.
  // A prior version of this effect did exactly that and hardcoded
  // `role: 'STUDENT'` as a placeholder that was supposed to get corrected
  // "on next action" but nothing ever did — every restored session silently
  // became a student session regardless of the account's real role, which
  // is what made teacher/parent accounts always land back on the student
  // tabs after a cold start even once those tabs became role-aware. Fetch
  // the real profile from /api/v1/auth/me instead, same as the web
  // frontend's checkAuth() already does on every mount.
  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) { setIsLoading(false); return; }
      setToken_(t);
      try {
        const me = await getCurrentUser();
        setUser({ id: me.user_id, email: me.email, role: me.role.toUpperCase() });
      } catch {
        // Token expired/invalid/network down — clear it rather than trap the
        // user in a half-authenticated state with a token that doesn't work.
        await clearToken();
        setToken_(null);
      }
      setIsLoading(false);
    })();
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
