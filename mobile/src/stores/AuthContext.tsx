// src/stores/AuthContext.tsx
// Provides auth state to the whole app; persists token via AsyncStorage

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  getToken,
  clearToken,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  ApiError,
} from '@/src/api/client';
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

      // Optimistically restore from the cached profile so a cold start with
      // no signal lands the user in the app (e.g. resuming a scavenger hunt
      // in a dead zone) instead of on the login screen.
      const cached = await getStoredUser<User>();
      if (cached) setUser(cached);

      try {
        const me = await getCurrentUser();
        const fresh: User = { id: me.user_id, email: me.email, role: me.role.toUpperCase() };
        setUser(fresh);
        await setStoredUser(fresh);
      } catch (err) {
        // Only a definitive auth rejection means the token is bad — clear it.
        // A network failure (offline) or a transient server error must NOT
        // log the user out; keep the cached session and let a later
        // /auth/me correct or clear it.
        const isAuthRejection = err instanceof ApiError && (err.status === 401 || err.status === 403);
        if (isAuthRejection || !cached) {
          await clearToken();
          await clearStoredUser();
          setToken_(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const data: LoginResponse = await apiLogin(email, password);
    const u: User = { id: data.user_id, email: data.email, role: data.role.toUpperCase() };
    setToken_(data.access_token);
    setUser(u);
    await setStoredUser(u);
  };

  const logout = async () => {
    await apiLogout();
    await clearStoredUser();
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
