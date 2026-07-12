import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import type { JwtClaims } from "@/types/api";

const STORAGE_KEY = "rag-builder.auth.token";

interface AuthContextValue {
  token: string | null;
  claims: JwtClaims | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeToken(token: string): JwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2 || !parts[1]) return null;
    const decoded = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return decoded as JwtClaims;
  } catch {
    return null;
  }
}

function readStoredToken(): { token: string | null; claims: JwtClaims | null } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { token: null, claims: null };
    const claims = decodeToken(stored);
    if (!claims || claims.exp * 1000 < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return { token: null, claims: null };
    }
    return { token: stored, claims };
  } catch {
    return { token: null, claims: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ token, claims }, setAuth] = useState<{
    token: string | null;
    claims: JwtClaims | null;
  }>(readStoredToken);

  const login = useCallback((newToken: string) => {
    const newClaims = decodeToken(newToken);
    try {
      localStorage.setItem(STORAGE_KEY, newToken);
    } catch {
      /* private mode */
    }
    setAuth({ token: newToken, claims: newClaims });
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode */
    }
    setAuth({ token: null, claims: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, claims, isAuthenticated: token !== null, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
