"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { RouteLoading } from "@/components/auth/route-loading";
import { getInitials } from "@/lib/utils";
import type { AppRole } from "@/lib/auth/roles";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  roles: AppRole[];
  initials: string;
  picture?: string;
};

export type AuthSession = {
  token: string;
  tokenType: "Bearer";
  expiresAt: number;
  user: AuthUser;
};

type LoginRequest = {
  username: string;
  password: string;
  role: AppRole;
};

type LoginResponse = {
  success: boolean;
  token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    name: string;
    email: string;
    role: AppRole;
    roles: AppRole[];
  };
};

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (input: LoginRequest) => Promise<AuthSession>;
  replaceSession: (session: AuthSession) => void;
  signOut: () => void;
};

const STORAGE_KEY = "buildos-infra.auth-session";

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeSession(response: LoginResponse): AuthSession {
  const expiresAt = Date.now() + response.expires_in * 1000;

  return {
    token: response.token,
    tokenType: "Bearer",
    expiresAt,
    user: {
      ...response.user,
      initials: getInitials(response.user.name, response.user.email)
    }
  };
}

function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (
      typeof parsed?.token !== "string" ||
      parsed.tokenType !== "Bearer" ||
      typeof parsed.expiresAt !== "number" ||
      !parsed.user ||
      typeof parsed.user.id !== "string" ||
      typeof parsed.user.name !== "string" ||
      typeof parsed.user.email !== "string" ||
      typeof parsed.user.role !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function AppAuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const storedSession = readStoredSession();
    if (storedSession && storedSession.expiresAt > Date.now()) {
      setSession(storedSession);
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [isHydrated, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const delay = session.expiresAt - Date.now();
    if (delay <= 0) {
      setSession(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSession(null);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [session]);

  async function signIn(input: LoginRequest): Promise<AuthSession> {
    setIsSigningIn(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(input)
      });

      const payload = (await response.json().catch(() => null)) as LoginResponse | null;

      if (!response.ok || !payload) {
        throw new Error((payload as { error?: string } | null)?.error ?? "Login failed");
      }

      const nextSession = normalizeSession(payload);
      setSession(nextSession);
      return nextSession;
    } finally {
      setIsSigningIn(false);
    }
  }

  function signOut() {
    setSession(null);
  }

  function replaceSession(nextSession: AuthSession) {
    setSession(nextSession);
  }

  if (!isHydrated) {
    return <RouteLoading />;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        token: session?.token ?? null,
        isLoading: isSigningIn,
        isAuthenticated: Boolean(session && session.expiresAt > Date.now()),
        signIn,
        replaceSession,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAppAuth must be used within AppAuthProvider");
  }

  return context;
}
