"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RouteLoading } from "@/components/auth/route-loading";
import { useAppAuth } from "@/components/auth/auth-provider";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAppAuth();
  const returnTo = searchParams.get("returnTo") ?? "/dashboard";

  useEffect(() => {
    router.replace(isAuthenticated ? returnTo : "/login");
  }, [isAuthenticated, returnTo, router]);

  return (
    <div className="min-h-screen p-8">
      <RouteLoading />
    </div>
  );
}
