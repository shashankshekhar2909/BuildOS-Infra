import Link from "next/link";
import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  pathname: string;
};

export function AppSidebar({ pathname }: AppSidebarProps) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(3,7,18,0.98))] px-5 py-6 lg:flex lg:flex-col">
      <Link href="/dashboard" className="group mb-8 block">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
            <span className="font-mono text-sm font-bold tracking-[0.24em]">BI</span>
          </div>
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-100/90">BuildOS Infra</div>
            <div className="text-xs text-[var(--muted-foreground)]">Control plane console</div>
          </div>
        </div>
      </Link>

      <nav className="space-y-2">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors",
                isActive
                  ? "border-cyan-400/20 bg-cyan-400/10 text-white"
                  : "border-transparent bg-white/[0.02] text-[var(--muted-foreground)] hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
              )}
            >
              <div className={cn("mt-0.5 rounded-xl p-2", isActive ? "bg-cyan-400/15 text-cyan-200" : "bg-white/5")}>
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs leading-relaxed text-inherit/70">{item.description}</div>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-3xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Security posture</div>
        <div className="mt-2 text-lg font-semibold text-white">Zero-trust edge ready</div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Session-aware navigation is live. Role enforcement can be layered onto these routes without refactoring the shell.
        </p>
      </div>
    </aside>
  );
}
