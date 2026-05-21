"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { RouteLoading } from "@/components/auth/route-loading";
import { useAppAuth } from "@/components/auth/auth-provider";

type AuthGuardProps = {
  children: React.ReactNode;
};

export function AuthGuard({ children }: AuthGuardProps) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAppAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnTo = encodeURIComponent(pathname || "/dashboard");
      window.location.replace(`/login?returnTo=${returnTo}`);
    }
  }, [isAuthenticated, isLoading, pathname]);

  if (isLoading || !isAuthenticated) {
    return <RouteLoading />;
  }

  return <>{children}</>;
}
