import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";

type AppShellProps = {
  pathname: string;
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AppShell({ pathname, title, subtitle, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.16),transparent_34%),linear-gradient(180deg,#030712_0%,#020617_100%)] text-white">
      <div className="flex min-h-screen">
        <AppSidebar pathname={pathname} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader title={title} subtitle={subtitle} />
          <main className="flex-1 px-4 py-6 xl:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
