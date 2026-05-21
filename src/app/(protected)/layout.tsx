"use client";

import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { navigationItems } from "@/lib/navigation";

type ProtectedLayoutProps = {
  children: React.ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const pathname = usePathname() ?? "/dashboard";

  const currentItem =
    navigationItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    navigationItems[0];

  return (
    <AuthGuard>
      <AppShell pathname={pathname} title={currentItem.label} subtitle={currentItem.description}>
        {children}
      </AppShell>
    </AuthGuard>
  );
}
