"use client";

import { useAppAuth } from "@/components/auth/auth-provider";

export function useAppUser() {
  const { user, isLoading, isAuthenticated } = useAppAuth();

  return {
    user,
    isLoading,
    isAuthenticated
  };
}
